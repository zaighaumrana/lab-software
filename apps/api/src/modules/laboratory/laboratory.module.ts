import { Module } from '@nestjs/common';
import { LaboratoryService } from './laboratory.service';
import { LaboratoryController } from './laboratory.controller';
import { LaboratoryGateway } from './laboratory.gateway';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [LaboratoryController],
  providers: [LaboratoryService, LaboratoryGateway],
  exports: [LaboratoryService],
})
export class LaboratoryModule {}
