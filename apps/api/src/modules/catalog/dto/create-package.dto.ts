import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsArray,
  Min,
  MaxLength,
} from 'class-validator';

export class CreatePackageDto {
  @IsString()
  @MaxLength(30)
  code!: string;

  @IsString()
  @MaxLength(150)
  name!: string;

  @IsNumber()
  @Min(0)
  basePrice!: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** Array of test IDs that belong to this package */
  @IsArray()
  @IsString({ each: true })
  testIds!: string[];
}
