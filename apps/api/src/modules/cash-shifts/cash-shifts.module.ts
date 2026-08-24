import { Module } from '@nestjs/common';
import { CashShiftsController } from './cash-shifts.controller';
import { CashShiftsService } from './cash-shifts.service';

@Module({
  controllers: [CashShiftsController],
  providers: [CashShiftsService],
})
export class CashShiftsModule {}
