import { IsString, IsOptional, MaxLength, IsEnum, IsInt, Min, Max } from 'class-validator';

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

export enum PrintModeDto {
  PLAIN = 'PLAIN',
  LETTERHEAD = 'LETTERHEAD',
}

export enum ReportPaginationDto {
  CONTINUOUS = 'CONTINUOUS',
  ONE_TEST_PER_PAGE = 'ONE_TEST_PER_PAGE',
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

  /** Plain paper (prints logo/header/footer) vs pre-printed letterhead (dynamic content only). */
  @IsOptional()
  @IsEnum(PrintModeDto)
  printMode?: PrintModeDto;

  /** Top margin in mm, applied to @page — matters most in letterhead mode. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(80)
  marginTopMm?: number;

  /** Bottom margin in mm, applied to @page — matters most in letterhead mode. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(80)
  marginBottomMm?: number;

  /** Continuous flow vs one test per printed page. */
  @IsOptional()
  @IsEnum(ReportPaginationDto)
  reportPagination?: ReportPaginationDto;
}
