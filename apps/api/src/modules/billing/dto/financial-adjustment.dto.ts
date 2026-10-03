import { IsEnum, IsNumber, IsString, Matches, MaxLength, Min } from 'class-validator';

export class FinancialOperationDto {
  @Matches(/^[a-zA-Z0-9_-]{8,100}$/)
  operationKey!: string;

  @IsString()
  @Matches(/\S/)
  @MaxLength(1000)
  reason!: string;
}

export enum BalanceAdjustmentType { CHARGE='CHARGE', DISCOUNT='DISCOUNT', WRITE_OFF='WRITE_OFF' }
export class FinancialAdjustmentDto extends FinancialOperationDto {
  @IsEnum(BalanceAdjustmentType)
  type!: BalanceAdjustmentType;

  @IsNumber({maxDecimalPlaces:2})
  @Min(0.01)
  amount!: number;
}

export class RefundDto extends FinancialOperationDto {
  @IsString()
  relatedPaymentId!: string;

  @IsNumber({maxDecimalPlaces:2})
  @Min(0.01)
  amount!: number;
}
