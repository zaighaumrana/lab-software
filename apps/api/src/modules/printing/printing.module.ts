import { Module } from '@nestjs/common';
import { PrintingService } from './printing.service';
import { PrintingController } from './printing.controller';
import { BillingModule } from '../billing/billing.module';
import { ReportingModule } from '../reporting/reporting.module';
import { SettingsModule } from '../settings/settings.module';
import { DoctorsModule } from '../doctors/doctors.module';

@Module({
  imports: [BillingModule, ReportingModule, SettingsModule, DoctorsModule],
  controllers: [PrintingController],
  providers: [PrintingService],
})
export class PrintingModule {}
