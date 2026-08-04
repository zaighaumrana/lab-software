import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsEnum,
  IsArray,
  ValidateNested,
  Min,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum ParameterValueTypeDto {
  NUMERIC = 'NUMERIC',
  TEXT = 'TEXT',
  BOOLEAN = 'BOOLEAN',
  CHOICE = 'CHOICE',
}

export enum GenderDto {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
  OTHER = 'OTHER',
  UNKNOWN = 'UNKNOWN',
}

export class ReferenceRangeDto {
  @IsOptional()
  @IsEnum(GenderDto)
  gender?: GenderDto;

  @IsOptional()
  @IsNumber()
  ageMinMonths?: number;

  @IsOptional()
  @IsNumber()
  ageMaxMonths?: number;

  @IsOptional()
  @IsNumber()
  lowNormal?: number;

  @IsOptional()
  @IsNumber()
  highNormal?: number;

  @IsOptional()
  @IsNumber()
  criticalLow?: number;

  @IsOptional()
  @IsNumber()
  criticalHigh?: number;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsString()
  interpretation?: string;
}

export class ParameterChoiceDto {
  @IsString()
  value!: string;

  @IsString()
  label!: string;

  @IsOptional()
  @IsNumber()
  sortOrder?: number;
}

export class TestParameterDto {
  @IsString()
  @MaxLength(30)
  code!: string;

  @IsString()
  @MaxLength(150)
  name!: string;

  @IsOptional()
  @IsEnum(ParameterValueTypeDto)
  valueType?: ParameterValueTypeDto;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsNumber()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @IsOptional()
  @IsNumber()
  decimalPlaces?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReferenceRangeDto)
  referenceRanges?: ReferenceRangeDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ParameterChoiceDto)
  choices?: ParameterChoiceDto[];
}

export class ReplaceTestParametersDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TestParameterDto)
  parameters!: TestParameterDto[];
}
  @IsString()
  @MaxLength(30)
  code!: string;

  @IsString()
  @MaxLength(150)
  name!: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  sampleType?: string;

  @IsNumber()
  @Min(0)
  basePrice!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  turnaroundHours?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** true = multi-parameter panel (CBC etc.) */
  @IsOptional()
  @IsBoolean()
  isPanel?: boolean;

  /**
   * Parameters for this test.
   * Single-value tests: one parameter.
   * Panels: many parameters (WBC, RBC, Hb...).
   * If omitted, a default single NUMERIC parameter is created from the test name.
   */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TestParameterDto)
  parameters?: TestParameterDto[];
}
