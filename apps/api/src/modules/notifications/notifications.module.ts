import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { SendPkProvider } from './providers/sendpk.provider';
import { SMS_GATEWAY } from './providers/sms-gateway.interface';

/**
 * To swap providers later (Jazz Business, Zong Business, etc.), change only
 * the `useClass` line below — nothing else in the codebase references
 * SendPkProvider directly, everything depends on the SmsGateway interface.
 */
@Module({
  providers: [
    NotificationsService,
    { provide: SMS_GATEWAY, useClass: SendPkProvider },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
