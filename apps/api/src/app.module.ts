import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './common/prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { PatientsModule } from './modules/patients/patients.module';
import { BookingsModule } from './modules/bookings/bookings.module';
import { BillingModule } from './modules/billing/billing.module';
import { LaboratoryModule } from './modules/laboratory/laboratory.module';
import { ReportingModule } from './modules/reporting/reporting.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { DoctorsModule } from './modules/doctors/doctors.module';
import { PublicModule } from './modules/public/public.module';
import { SettingsModule } from './modules/settings/settings.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../packages/database/.env'],
    }),
    PrismaModule,
    AuthModule,
    PatientsModule,
    BookingsModule,
    BillingModule,
    LaboratoryModule,
    ReportingModule,
    CatalogModule,
    DoctorsModule,
    PublicModule,
    SettingsModule,
    NotificationsModule,
    AnalyticsModule,
  ],
})
export class AppModule {}
