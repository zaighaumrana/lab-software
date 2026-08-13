import { Module } from '@nestjs/common';
import { PublicService } from './public.service';
import { PublicController } from './public.controller';
import { PatientsModule } from '../patients/patients.module';
import { ReportingModule } from '../reporting/reporting.module';
import { SettingsModule } from '../settings/settings.module';
import { PrintingModule } from '../printing/printing.module';

@Module({
  imports: [PatientsModule, ReportingModule, SettingsModule, PrintingModule],
  controllers: [PublicController],
  providers: [PublicService],
})
export class PublicModule {}
