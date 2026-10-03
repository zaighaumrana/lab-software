import {
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  IsNumber,
  Min,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';

export class InvoiceLineInputDto {
  @IsOptional()
  @IsString()
  testId?: string;

  @IsOptional()
  @IsString()
  packageId?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  quantity?: number;

  /** Manual discount amount for this line (requires reason) */
  @IsOptional()
  @IsNumber()
  @Min(0)
  manualDiscount?: number;

  @IsOptional()
  @IsString()
  manualDiscountReason?: string;
}

export class CreateInvoiceDto {
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  invoiceDiscountAmount?: number;

  @IsOptional()
  @IsString()
  invoiceDiscountReason?: string;

  @IsString()
  bookingId!: string;

  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceLineInputDto)
  lines!: InvoiceLineInputDto[];
}
