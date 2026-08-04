import { IsOptional, IsString, MinLength } from 'class-validator';

export class SearchPatientDto {
  /** Search by phone, CNIC, or name (partial) */
  @IsString()
  @MinLength(2)
  q!: string;

  @IsOptional()
  @IsString()
  branchId?: string;
}
