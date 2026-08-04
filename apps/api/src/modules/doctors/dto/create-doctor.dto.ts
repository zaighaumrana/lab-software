import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsBoolean,
  Min,
  MaxLength,
} from 'class-validator';

export enum CommissionTypeDto {
  PERCENTAGE = 'PERCENTAGE',
  FIXED_AMOUNT = 'FIXED_AMOUNT',
  PER_TEST_FIXED = 'PER_TEST_FIXED',
}

export class CreateDoctorDto {
  @IsString()
  @MaxLength(150)
  fullName!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  specialty?: string;

  @IsOptional()
  @IsString()
  clinicName?: string;

  @IsOptional()
  @IsEnum(CommissionTypeDto)
  commissionType?: CommissionTypeDto;

  @IsOptional()
  @IsNumber()
  @Min(0)
  commissionValue?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
