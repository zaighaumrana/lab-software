import {
  IsString,
  IsOptional,
  IsEnum,
  IsDateString,
  IsArray,
  ValidateNested,
  IsNumber,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum BookingSourceDto {
  WALK_IN = 'WALK_IN',
  ONLINE = 'ONLINE',
  HOME_COLLECTION = 'HOME_COLLECTION',
  PHONE = 'PHONE',
}

export class BookingLineDto {
  @IsOptional()
  @IsString()
  testId?: string;

  @IsOptional()
  @IsString()
  packageId?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  quantity?: number;
}

export class CreateBookingDto {
  @IsString()
  patientId!: string;

  @IsOptional()
  @IsString()
  doctorId?: string;

  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsEnum(BookingSourceDto)
  source?: BookingSourceDto;

  @IsOptional()
  @IsString()
  notes?: string;

  // Home collection fields
  @IsOptional()
  @IsString()
  homeAddress?: string;

  @IsOptional()
  @IsString()
  homeCollectorId?: string;

  @IsOptional()
  @IsString()
  homeRouteNotes?: string;

  @IsOptional()
  @IsDateString()
  homeTimeWindowStart?: string;

  @IsOptional()
  @IsDateString()
  homeTimeWindowEnd?: string;

  @IsOptional()
  @IsDateString()
  preferredAt?: string;

  /** Optional lines — if provided, invoice can be generated immediately after */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BookingLineDto)
  lines?: BookingLineDto[];
}
