import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ResultValueInputDto {
  @IsOptional()
  @IsString()
  testParameterId?: string;

  @IsOptional()
  @IsString()
  versionParameterId?: string;

  @IsOptional()
  @IsNumber()
  valueNumeric?: number;

  @IsOptional()
  @IsString()
  valueText?: string;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsString()
  interpretation?: string;
}

export class EnterResultDto {
  @IsString()
  sampleId!: string;

  @IsOptional()
  @IsString()
  invoiceLineId?: string;

  @IsOptional()
  @IsString()
  testId?: string;

  @IsOptional()
  @IsString()
  orderedTestId?: string;

  /**
   * One entry per parameter.
   * For single-value tests, send one item.
   * For panels (CBC etc.), send one item per parameter.
   */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ResultValueInputDto)
  values!: ResultValueInputDto[];

  @IsOptional()
  @IsString()
  notes?: string;

  /** Release only when explicitly true. */
  @IsOptional()
  @IsBoolean()
  releaseImmediately?: boolean;
}
