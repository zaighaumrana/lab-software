import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { PublicReportProjection, PUBLIC_REPORT_SCHEMA } from './public-projection';

export const PUBLIC_SYNC_TRANSPORT = Symbol('PUBLIC_SYNC_TRANSPORT');
export type SyncFailureCode = 'NETWORK_UNAVAILABLE' | 'TIMEOUT' | 'RATE_LIMITED' | 'TEMPORARY_REMOTE_FAILURE'
  | 'INVALID_PAYLOAD' | 'UNSUPPORTED_SCHEMA' | 'AUTH_REJECTED' | 'ARTIFACT_INVALID' | 'REVISION_CONFLICT';
export class PublicSyncFailure extends Error {
  constructor(readonly code: SyncFailureCode, readonly transient: boolean) { super(code); }
}
export interface PublicSyncTransport {
  isConfigured(): boolean;
  /** Create-only/content-addressed private storage. Never make an upload itself publicly readable. */
  ensureArtifact(artifact: NonNullable<PublicReportProjection['artifact']>, bytes: Buffer, signal: AbortSignal): Promise<void>;
  /** Receiver atomically checks revision, updates availability and revokes old PDF authorization. */
  upsertProjection(projection: PublicReportProjection, signal: AbortSignal): Promise<'APPLIED' | 'IDENTICAL' | 'OLDER'>;
}
export class UnconfiguredPublicSyncTransport implements PublicSyncTransport {
  isConfigured() { return false; }
  async ensureArtifact(): Promise<void> { throw new PublicSyncFailure('AUTH_REJECTED', false); }
  async upsertProjection(): Promise<'APPLIED'> { throw new PublicSyncFailure('AUTH_REJECTED', false); }
}

const keys = (value: unknown, allowed: string[]): value is Record<string, unknown> => !!value && typeof value === 'object'
  && !Array.isArray(value) && isDeepStrictEqual(Object.keys(value).sort(), [...allowed].sort());
export function validatePublicProjection(value: unknown): asserts value is PublicReportProjection {
  if (!keys(value, ['schemaVersion','projectionKey','projectionRevision','trackingId','reportReady','onlineEligible','currentVersion','artifact'])) {
    throw new PublicSyncFailure('INVALID_PAYLOAD', false);
  }
  if (value.schemaVersion !== PUBLIC_REPORT_SCHEMA) throw new PublicSyncFailure('UNSUPPORTED_SCHEMA', false);
  const v = value as unknown as PublicReportProjection;
  if (!/^[a-f0-9-]{36}$/.test(v.projectionKey) || typeof v.projectionRevision !== 'string' || !/^[1-9][0-9]{0,18}$/.test(v.projectionRevision)
    || typeof v.trackingId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(v.trackingId)
    || typeof v.reportReady !== 'boolean' || typeof v.onlineEligible !== 'boolean'
    || (v.currentVersion !== null && (!keys(v.currentVersion, ['versionNo']) || !Number.isSafeInteger(v.currentVersion.versionNo) || v.currentVersion.versionNo < 1))
    || v.reportReady !== (v.currentVersion !== null) || (v.onlineEligible && !v.reportReady)) throw new PublicSyncFailure('INVALID_PAYLOAD', false);
  const a = v.artifact;
  if (a !== null && (!keys(a, ['logicalKey','sha256','size']) || !v.onlineEligible || !v.currentVersion
    || typeof a.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(a.sha256) || !Number.isSafeInteger(a.size) || a.size < 1
    || a.logicalKey !== `${v.projectionKey}/version-${v.currentVersion.versionNo}/${a.sha256}.pdf`)) throw new PublicSyncFailure('INVALID_PAYLOAD', false);
}

/** Deterministic, no-network F1 receiver. F2 must implement the same atomic database conditions. */
export class MemoryPublicSyncTransport implements PublicSyncTransport {
  readonly projections = new Map<string, PublicReportProjection>();
  readonly artifacts = new Map<string, Buffer>();
  isConfigured() { return true; }
  async ensureArtifact(artifact: NonNullable<PublicReportProjection['artifact']>, bytes: Buffer, signal: AbortSignal) {
    signal.throwIfAborted();
    if (bytes.length !== artifact.size || createHash('sha256').update(bytes).digest('hex') !== artifact.sha256) {
      throw new PublicSyncFailure('ARTIFACT_INVALID', false);
    }
    const old = this.artifacts.get(artifact.logicalKey);
    if (old && !old.equals(bytes)) throw new PublicSyncFailure('ARTIFACT_INVALID', false);
    this.artifacts.set(artifact.logicalKey, Buffer.from(bytes));
  }
  async upsertProjection(projection: PublicReportProjection, signal: AbortSignal) {
    signal.throwIfAborted(); validatePublicProjection(projection);
    const old = this.projections.get(projection.projectionKey);
    if (old && BigInt(old.projectionRevision) > BigInt(projection.projectionRevision)) return 'OLDER' as const;
    if (old && old.projectionRevision === projection.projectionRevision) {
      if (!isDeepStrictEqual(old, projection)) throw new PublicSyncFailure('REVISION_CONFLICT', false);
      return 'IDENTICAL' as const;
    }
    if (projection.artifact && !this.artifacts.has(projection.artifact.logicalKey)) throw new PublicSyncFailure('ARTIFACT_INVALID', false);
    this.projections.set(projection.projectionKey, structuredClone(projection));
    return 'APPLIED' as const;
  }
}
