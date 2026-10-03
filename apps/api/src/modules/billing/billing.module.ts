import { Module } from '@nestjs/common';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { BookingsModule } from '../bookings/bookings.module';
import { LaboratoryModule } from '../laboratory/laboratory.module';

@Module({
  imports: [BookingsModule, LaboratoryModule],
  controllers: [BillingController],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}
