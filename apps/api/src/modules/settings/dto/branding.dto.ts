import { IsString, IsOptional, MaxLength } from 'class-validator';

export class BrandingDto {
  @IsString()
  @MaxLength(120)
  labName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  primaryColor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  secondaryColor?: string;

  /** Base64 data URL (image/png or image/jpeg). Keep under ~500KB. */
  @IsOptional()
  @IsString()
  logoDataUrl?: string | null;
}

export class PrintLayoutDto {
  @IsString()
  @MaxLength(120)
  labName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  labNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  footerText?: string;
}
