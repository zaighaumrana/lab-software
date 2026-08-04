import { IsString, IsOptional, IsEnum, IsBoolean, MinLength } from 'class-validator';

export enum UserRoleDto {
  ADMIN = 'ADMIN',
  RECEPTION = 'RECEPTION',
  SAMPLE_COLLECTOR = 'SAMPLE_COLLECTOR',
  LAB_TECH = 'LAB_TECH',
  LAB_OPERATOR = 'LAB_OPERATOR',
  CASHIER = 'CASHIER',
  PATHOLOGIST = 'PATHOLOGIST',
  ACCOUNTANT = 'ACCOUNTANT',
}

export class CreateUserDto {
  @IsString()
  @MinLength(3)
  username!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsString()
  fullName!: string;

  @IsEnum(UserRoleDto)
  role!: UserRoleDto;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  branchId?: string;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsEnum(UserRoleDto)
  role?: UserRoleDto;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;
}
