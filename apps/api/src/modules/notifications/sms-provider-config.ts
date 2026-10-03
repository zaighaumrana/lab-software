import { Prisma } from '@lms/database';
import { SmsGateway } from './providers/sms-gateway.interface';

export const SMS_PROVIDER_KEY = 'sms_provider';
export const IMPLEMENTED_SMS_PROVIDERS = ['SENDPK'] as const;
export interface SmsProviderConfig { enabled: boolean; provider: string }
// No row preserves existing installations. Persisted malformed configuration fails closed.
export async function getSmsProviderConfig(db: Pick<Prisma.TransactionClient, 'configuration'>, tenantId: string): Promise<SmsProviderConfig> {
  const row = await db.configuration.findUnique({where:{tenantId_key:{tenantId,key:SMS_PROVIDER_KEY}}});
  if (!row) return {enabled:true,provider:'SENDPK'};
  const value = row.value as {enabled?:unknown;provider?:unknown};
  return {enabled:value?.enabled===true,provider:typeof value?.provider==='string'?value.provider:''};
}
/** Add implemented providers here; clinical/sample/report workflows stay unchanged. */
export function selectSmsGateway(provider: string, sendpk: SmsGateway): SmsGateway | undefined {
  const implementations: Record<string,SmsGateway> = {SENDPK:sendpk};
  return Object.prototype.hasOwnProperty.call(implementations,provider)?implementations[provider]:undefined;
}
