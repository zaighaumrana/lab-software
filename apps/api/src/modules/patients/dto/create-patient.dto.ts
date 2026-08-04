import {
  IsString,
  IsOptional,
  IsBoolean,
  IsEnum,
  IsDateString,
  IsEmail,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';

export enum GenderDto {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
  OTHER = 'OTHER',
  UNKNOWN = 'UNKNOWN',
}

export class CreatePatientDto {
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  fullName!: string;

  @IsString()
  @Matches(/^03\d{9}$/, {
    message: 'Phone must be a valid Pakistani mobile number (03XXXXXXXXX)',
  })
  phone!: string;

  @IsOptional()
  @IsString()
  @Matches(/^03\d{9}$/, {
    message: 'Alternate phone must be a valid Pakistani mobile number',
  })
  phoneAlt?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{5}-\d{7}-\d$/, {
    message: 'CNIC must be in format 12345-1234567-1',
  })
  cnic?: string;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsEnum(GenderDto)
  gender?: GenderDto;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  bloodGroup?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsBoolean()
  smsConsent?: boolean;
}
