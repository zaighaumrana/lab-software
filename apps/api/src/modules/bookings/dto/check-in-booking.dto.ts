import { IsOptional, IsString } from 'class-validator';

export class CheckInBookingDto {
  @IsOptional()
  @IsString()
  notes?: string;
}
