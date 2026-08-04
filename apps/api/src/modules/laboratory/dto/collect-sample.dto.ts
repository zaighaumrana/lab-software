import { IsString, IsOptional, IsDateString } from 'class-validator';

export class CollectSampleDto {
  @IsString()
  invoiceId!: string;

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
