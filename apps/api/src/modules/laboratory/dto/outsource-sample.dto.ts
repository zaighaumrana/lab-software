import { IsString, IsOptional, IsNumber, Min, MaxLength } from 'class-validator';

export class OutsourceSampleDto {
  @IsString()
  @MaxLength(150)
  externalLabName!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  outsourcingCost?: number;
}
