import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { resolve } from 'node:path';
import { NestModule, MiddlewareConsumer } from '@nestjs/common';
import { auditContext } from './common/audit';
import { PrismaModule } from './common/prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { PatientsModule } from './modules/patients/patients.module';
import { BookingsModule } from './modules/bookings/bookings.module';
import { BillingModule } from './modules/billing/billing.module';
import { LaboratoryModule } from './modules/laboratory/laboratory.module';
import { ReportingModule } from './modules/reporting/reporting.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { DoctorsModule } from './modules/doctors/doctors.module';
import { SettingsModule } from './modules/settings/settings.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { PrintingModule } from './modules/printing/printing.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { CashShiftsModule } from './modules/cash-shifts/cash-shifts.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: process.env.DB_RUNTIME_MODE==='development' && process.env.NODE_ENV!=='production'
        ? [resolve(__dirname,'../.env'),resolve(__dirname,'../../../packages/database/.env')]
        : [resolve(__dirname,'../.env.runtime')],
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
    SettingsModule,
    NotificationsModule,
    AnalyticsModule,
    PrintingModule,
    DashboardModule,
    CashShiftsModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply((req: { ip?: string; headers: Record<string, unknown> }, _res: unknown, next: () => void) => {
      const ua = req.headers['user-agent'];
      auditContext.run({ ipAddress: req.ip, userAgent: typeof ua === 'string' ? ua.slice(0, 256) : undefined }, next);
    }).forRoutes('*');
  }
}
