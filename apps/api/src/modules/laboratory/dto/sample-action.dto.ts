import { IsOptional, IsString, MaxLength } from 'class-validator';

export class AcceptSampleDto {
  @IsOptional()
  @IsString()
  notes?: string;
}

export class RejectSampleDto {
  @IsString()
  @MaxLength(300)
  rejectionReason!: string;
}
