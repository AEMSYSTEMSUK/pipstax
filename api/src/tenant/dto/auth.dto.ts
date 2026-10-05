import { IsEmail, IsIn, IsNotEmpty, IsString, MinLength, IsOptional } from 'class-validator';
import { DOCUMENT_SYNC_PROVIDERS, type DocumentSyncProvider } from '../../constants/document-sync';
import { ACCOUNTING_PROVIDERS, type AccountingProvider } from '../../constants/accounting';

export class CommonLoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;
}

export class BootstrapTenantDto {
  @IsString()
  @IsNotEmpty()
  tenantName!: string;

  @IsString()
  @IsNotEmpty()
  tradingName!: string;

  @IsEmail()
  adminEmail!: string;

  @IsString()
  @MinLength(6)
  adminPassword!: string;

  @IsString()
  @IsNotEmpty()
  adminName!: string;

  @IsIn(DOCUMENT_SYNC_PROVIDERS as unknown as string[])
  documentSyncProvider!: DocumentSyncProvider;

  @IsOptional()
  @IsString()
  primaryColor?: string;

  @IsOptional()
  @IsString()
  subdomain?: string;

  @IsIn(ACCOUNTING_PROVIDERS as unknown as string[])
  accountingProvider!: AccountingProvider;
}

export class SelectTenantDto {
  @IsString()
  @IsNotEmpty()
  tenantId!: string;
}

export class VerifyAccountOtpDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  code!: string;
}

export class ResendAccountOtpDto {
  @IsEmail()
  email!: string;
}

export class ForgotPasswordDto {
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  token!: string;

  @IsString()
  @MinLength(6)
  password!: string;
}
