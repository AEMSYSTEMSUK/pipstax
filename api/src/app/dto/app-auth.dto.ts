import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class AppLoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;
}

export class AppSelectTenantDto {
  @IsString()
  @IsNotEmpty()
  tenantId!: string;
}

export class AppForgotPasswordDto {
  @IsEmail()
  email!: string;
}

export class AppResetPasswordDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  token!: string;

  @IsString()
  @MinLength(6)
  password!: string;
}
