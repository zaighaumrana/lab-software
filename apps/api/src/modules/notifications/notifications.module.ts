import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { SendPkProvider } from './providers/sendpk.provider';
import { SMS_GATEWAY } from './providers/sms-gateway.interface';
import { NotificationDispatcher } from './notification-dispatcher.service';
import { NotificationsController } from './notifications.controller';

/**
 * To swap providers later (Jazz Business, Zong Business, etc.), change only
 * the `useClass` line below — nothing else in the codebase references
 * SendPkProvider directly, everything depends on the SmsGateway interface.
 */
@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationDispatcher,
    { provide: SMS_GATEWAY, useClass: SendPkProvider },
  ],
  exports: [NotificationsService, SMS_GATEWAY],
})
export class NotificationsModule {}
