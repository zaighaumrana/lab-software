import {
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class AmendValueInputDto {
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

export class AmendResultDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AmendValueInputDto)
  values!: AmendValueInputDto[];

  @IsString()
  amendmentReason!: string;
}
