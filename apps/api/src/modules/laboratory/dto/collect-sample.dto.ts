import { IsString, IsOptional, IsDateString, IsArray, ArrayUnique } from 'class-validator';

export class CollectSampleDto {
  @IsString()
  invoiceId!: string;
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  orderedTestIds?: string[];

  @IsOptional()
  @IsString()
  sampleType?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  /** Optional: for home collection already in transit */
  @IsOptional()
  @IsDateString()
  collectedAt?: string;
}
