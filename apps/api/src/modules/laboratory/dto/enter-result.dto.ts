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
  @IsString()
  testParameterId!: string;

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

  @IsString()
  invoiceLineId!: string;

  @IsString()
  testId!: string;

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

  /** If true (default), release immediately after entry (single-step workflow) */
  @IsOptional()
  @IsBoolean()
  releaseImmediately?: boolean;
}
