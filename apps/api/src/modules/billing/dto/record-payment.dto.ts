import {
  IsNumber,
  IsEnum,
  IsOptional,
  IsString,
  Min,
  Matches,
} from 'class-validator';

export enum PaymentMethodDto {
  CASH = 'CASH',
  BANK_TRANSFER = 'BANK_TRANSFER',
  EASYPAISA = 'EASYPAISA',
  JAZZCASH = 'JAZZCASH',
  CARD = 'CARD',
  OTHER = 'OTHER',
}

export class RecordPaymentDto {
  @Matches(/^[a-zA-Z0-9_-]{8,100}$/)
  operationKey!: string;

  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsEnum(PaymentMethodDto)
  method!: PaymentMethodDto;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
