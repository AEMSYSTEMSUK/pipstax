import { IsBoolean, IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class CustomerInviteDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsBoolean()
  sendInvite?: boolean;
}

export class CustomerInviteAcceptDto {
  @IsString()
  @IsNotEmpty()
  token!: string;

  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;
}

export class CustomerLoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;
}

export class CustomerSelectTenantDto {
  @IsString()
  @IsNotEmpty()
  tenantId!: string;
}

export class CustomerForgotPasswordDto {
  @IsEmail()
  email!: string;
}

export class CustomerResetPasswordDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  token!: string;

  @IsString()
  @MinLength(6)
  password!: string;
}

export class CustomerAdminResetPasswordDto {
  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;
}
