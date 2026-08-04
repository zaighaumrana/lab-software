import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationStatus, NotificationChannel } from '@lms/database';
import { SMS_GATEWAY, SmsGateway } from './providers/sms-gateway.interface';

const MAX_ATTEMPTS = 3;

/**
 * Implements the Notification state machine from 03_Core_Domain_Design.md:
 * Queued -> Sending -> Sent | Failed -> Retrying -> Sending | Abandoned.
 *
 * v1 note: sends happen synchronously/inline when called (no separate background
 * dispatcher yet, since there's only one lab server and this keeps things simple).
 * If a send fails, the record is left in FAILED/RETRYING so a scheduled retry job
 * can pick it up later without losing the message — that job is the one piece
 * still to be added (see notes at the bottom of this file).
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SMS_GATEWAY) private readonly gateway: SmsGateway,
  ) {}

  /**
   * Queue + immediately attempt to send an SMS. Always creates a Notification
   * record first (even if the send fails) so nothing is ever silently lost —
   * failed sends are visible on the admin dashboard's notification list.
   */
  async sendSms(
    tenantId: string,
    recipient: string,
    body: string,
    opts?: { templateKey?: string; relatedType?: string; relatedId?: string },
  ) {
    const notification = await this.prisma.notification.create({
      data: {
        tenantId,
        channel: NotificationChannel.SMS,
        status: NotificationStatus.QUEUED,
        recipient,
        body,
        templateKey: opts?.templateKey,
        relatedType: opts?.relatedType,
        relatedId: opts?.relatedId,
      },
    });

    return this.attemptSend(notification.id);
  }

  private async attemptSend(notificationId: string) {
    const notification = await this.prisma.notification.update({
      where: { id: notificationId },
      data: { status: NotificationStatus.SENDING },
    });

    const result = await this.gateway.send(notification.recipient, notification.body);

    if (result.success) {
      return this.prisma.notification.update({
        where: { id: notificationId },
        data: {
          status: NotificationStatus.SENT,
          sentAt: new Date(),
          attempts: { increment: 1 },
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
