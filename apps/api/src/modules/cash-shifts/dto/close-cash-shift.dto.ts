import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CloseCashShiftDto {
  @IsNumber()
  @Min(0)
  countedCash!: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
