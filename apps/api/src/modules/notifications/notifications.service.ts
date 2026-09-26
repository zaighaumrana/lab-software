import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationStatus, NotificationChannel, Prisma } from '@lms/database';
import { SMS_GATEWAY, SmsGateway } from './providers/sms-gateway.interface';
import {
  SmsEventKey,
  getSmsEventDefinition,
  validatePlaceholders,
  renderLocalTemplate,
  buildSendPkVariables,
  calculateSmsSegments,
  normalizePakistaniMobile,
} from '@lms/shared';

const MAX_ATTEMPTS = 3;
const PROVIDER_NAME = 'SENDPK';

export type SendOutcome =
  | { skipped: true; reason: 'NOT_CONFIGURED' | 'DISABLED' | 'ALREADY_SENT' | 'NOT_READY'; message?: string }
  | { skipped: false; notificationId: string };

function isUniqueConstraintError(e: unknown): e is Prisma.PrismaClientKnownRequestError {
  return (
    e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002'
  );
}

/**
 * Implements the Notification state machine from 03_Core_Domain_Design.md:
 * Queued -> Sending -> Sent | Failed -> Retrying -> Sending | Abandoned.
 *
 * All wording lives in SmsTemplate (administrator-owned, edited via
 * Settings → SMS); this service never hardcodes SMS text. Every automatic
 * transactional SMS goes through `sendTemplatedSms`, keyed by one of the
 * two supported event keys (SAMPLE_COLLECTED, REPORT_READY) — see
 * @lms/shared's sms-events.ts for the full definition of each event.
 *
 * v1 note: sends happen synchronously/inline when called (no separate
 * background dispatcher yet, since there's only one lab server and this
 * keeps things simple). If a send fails, the record is left in
 * FAILED/RETRYING so a scheduled retry job can pick it up later without
 * losing the message — that job is the one piece still to be added (see
 * notes at the bottom of this file).
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SMS_GATEWAY) private readonly gateway: SmsGateway,
  ) {}

  /**
   * Queue + immediately attempt to send the SMS configured for `eventKey`.
   * Never throws for "expected" not-ready states (disabled event, no
   * template configured, no SENDPK mapping, invalid number, unknown
   * placeholder) — those are business-as-usual and must never break the
   * caller's booking/sample/report workflow. Only truly unexpected DB
   * errors propagate.
   *
   * Idempotent per (tenant, relatedType, relatedId, eventKey): calling this
   * twice for the same event on the same entity (retry, double-submit,
   * websocket race) sends at most once.
   */
  async sendTemplatedSms(
    tenantId: string,
    eventKey: SmsEventKey,
    recipient: string,
    variables: Record<string, string>,
    opts: { relatedType: string; relatedId: string },
  ): Promise<SendOutcome> {
    const definition = getSmsEventDefinition(eventKey);
    if (!definition) {
      this.logger.error(`Unknown SMS event key: ${eventKey}`);
      return { skipped: true, reason: 'NOT_CONFIGURED' };
    }

    const template = await this.prisma.smsTemplate.findUnique({
      where: { tenantId_key: { tenantId, key: eventKey } },
    });

    if (!template) {
      this.logger.log(
        `SMS event ${eventKey} skipped for ${opts.relatedType}:${opts.relatedId} — no template configured yet.`,
      );
      return { skipped: true, reason: 'NOT_CONFIGURED' };
    }

    if (!template.isActive) {
      this.logger.log(
        `SMS event ${eventKey} skipped for ${opts.relatedType}:${opts.relatedId} — event is disabled.`,
      );
      return { skipped: true, reason: 'DISABLED' };
    }

    const validation = validatePlaceholders(template.body);
    if (!validation.valid) {
      return this.recordUnsendable(
        tenantId,
        eventKey,
        recipient,
        template.body,
        opts,
        `Template has unknown SMS variable(s): ${validation.unknown.join(', ')}`,
      );
    }

    const renderedBody = renderLocalTemplate(template.body, variables);
    const segments = calculateSmsSegments(renderedBody);

    if (!template.sendpkTemplateId) {
      return this.recordUnsendable(
        tenantId,
        eventKey,
        recipient,
        renderedBody,
        opts,
        'Not ready for sending - approve this template in SENDPK and sync templates.',
        segments,
      );
    }

    const requiredVariables = Array.isArray(template.sendpkRequiredVariables)
      ? (template.sendpkRequiredVariables as unknown[]).map(String)
      : [];
    const sendPkVariables = buildSendPkVariables(template.body, variables);
    const missing = requiredVariables.filter((v) => !(v in sendPkVariables));
    if (missing.length > 0) {
      return this.recordUnsendable(
        tenantId,
        eventKey,
        recipient,
        renderedBody,
        opts,
        `SENDPK template requires variable(s) not available locally: ${missing.join(', ')}`,
        segments,
      );
    }

    const normalizedMobile = normalizePakistaniMobile(recipient);
    if (!normalizedMobile) {
      return this.recordUnsendable(
        tenantId,
        eventKey,
        recipient,
        renderedBody,
        opts,
        `Invalid recipient mobile number: ${recipient}`,
        segments,
      );
    }

    let notification;
    try {
      notification = await this.prisma.notification.create({
        data: {
          tenantId,
          channel: NotificationChannel.SMS,
          status: NotificationStatus.QUEUED,
          recipient: normalizedMobile,
          body: renderedBody,
          templateKey: eventKey,
          relatedType: opts.relatedType,
          relatedId: opts.relatedId,
          provider: PROVIDER_NAME,
          providerTemplateId: template.sendpkTemplateId,
          providerVariables: sendPkVariables,
          messageType: segments.type,
          smsParts: segments.parts,
        },
      });
    } catch (e) {
      if (isUniqueConstraintError(e)) {
        this.logger.log(
          `SMS event ${eventKey} for ${opts.relatedType}:${opts.relatedId} was already sent — skipping duplicate.`,
        );
        return { skipped: true, reason: 'ALREADY_SENT' };
      }
      throw e;
    }

    await this.attemptSend(notification.id);
    return { skipped: false, notificationId: notification.id };
  }

  /** Creates a FAILED, never-attempted Notification row so the reason is visible on the admin dashboard, without spending an actual SENDPK request. */
  private async recordUnsendable(
    tenantId: string,
    eventKey: SmsEventKey,
    recipient: string,
    body: string,
    opts: { relatedType: string; relatedId: string },
    reason: string,
    segments?: { type: string; parts: number },
  ): Promise<SendOutcome> {
    this.logger.warn(
      `SMS event ${eventKey} not sent for ${opts.relatedType}:${opts.relatedId}: ${reason}`,
    );
    try {
      await this.prisma.notification.create({
        data: {
          tenantId,
          channel: NotificationChannel.SMS,
          status: NotificationStatus.FAILED,
          recipient,
          body,
          templateKey: eventKey,
          relatedType: opts.relatedType,
          relatedId: opts.relatedId,
          lastError: reason,
          messageType: segments?.type,
          smsParts: segments?.parts,
        },
      });
    } catch (e) {
      if (!isUniqueConstraintError(e)) throw e;
      // Already recorded (e.g. a prior attempt already logged the same
      // not-ready state for this event/entity) — nothing more to do.
    }
    return { skipped: true, reason: 'NOT_READY', message: reason };
  }

  private async attemptSend(notificationId: string) {
    const notification = await this.prisma.notification.update({
      where: { id: notificationId },
      data: { status: NotificationStatus.SENDING },
    });

    if (!notification.providerTemplateId) {
      return this.prisma.notification.update({
        where: { id: notificationId },
        data: {
          status: NotificationStatus.FAILED,
          lastError: 'No SENDPK template mapped for this notification',
        },
      });
    }

    const result = await this.gateway.send({
      mobile: notification.recipient,
      templateId: notification.providerTemplateId,
      variables: (notification.providerVariables as Record<string, string>) ?? {},
      unicode: notification.messageType === 'unicode',
    });

    // Never store the raw provider response unbounded — keep enough for
    // troubleshooting without risking secrets/PII bloat in the DB.
    const truncatedResponse = result.rawResponse?.slice(0, 500) ?? '';

    if (result.success) {
      return this.prisma.notification.update({
        where: { id: notificationId },
        data: {
          status: NotificationStatus.SENT,
          sentAt: new Date(),
          attempts: { increment: 1 },
          provider: PROVIDER_NAME,
          providerMessageId: result.providerMessageId,
          providerStatus: 'ACCEPTED',
          acceptedAt: new Date(),
          lastProviderResponse: truncatedResponse,
        },
      });
    }

    const attempts = notification.attempts + 1;
    const nextStatus =
      attempts >= MAX_ATTEMPTS ? NotificationStatus.ABANDONED : NotificationStatus.RETRYING;

    if (nextStatus === NotificationStatus.ABANDONED) {
      this.logger.warn(
        `Notification ${notificationId} to ${notification.recipient} abandoned after ${attempts} attempts: ${result.errorMessage}`,
      );
    }

    return this.prisma.notification.update({
      where: { id: notificationId },
      data: {
        status: nextStatus,
        attempts,
        lastError: result.errorMessage ?? 'Unknown error',
        lastProviderResponse: truncatedResponse,
      },
    });
  }

  /** For the admin dashboard — surfaces anything that needs attention. */
  async listAbandoned(tenantId: string) {
    return this.prisma.notification.findMany({
      where: { tenantId, status: NotificationStatus.ABANDONED },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Manual retry — call this from an admin "retry" button, or wire it to a
   * scheduled job later (e.g. @nestjs/schedule cron every few minutes) to
   * pick up anything still sitting in RETRYING.
   */
  async retry(notificationId: string) {
    return this.attemptSend(notificationId);
  }
}

// TODO (next iteration, not v1-blocking): a scheduled job that finds
// notifications in RETRYING and calls retry() automatically with backoff,
// instead of relying on someone clicking "retry" in the admin UI. Fine to
// defer since SMS sends happen inline today and failures are rare on a
// single, always-on local server — but worth adding once real usage shows
// how often SendPK actually times out.
