import {
  IsArray,
  IsEmail,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class UserCreateDto {
  @IsString()
  @IsNotEmpty()
  fullName!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  hourlyRate?: number;

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  @IsArray()
  roleCodes!: string[];
}

export class UserUpdateRolesDto {
  @IsArray()
  roleCodes!: string[];
}

export class UserUpdateDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  fullName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  hourlyRate?: number;
}

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  currentPassword!: string;

  @IsString()
  @MinLength(6)
  newPassword!: string;
}

export class UserResetPasswordDto {
  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;
}
