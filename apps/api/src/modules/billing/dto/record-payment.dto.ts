import {
  IsNumber,
  IsEnum,
  IsOptional,
  IsString,
  Min,
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
