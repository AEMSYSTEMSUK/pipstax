import { IsEmail, IsNotEmpty, IsString, IsUUID, Length, Matches } from 'class-validator';

export class QuoteSignDto {
  @IsString()
  @IsNotEmpty()
  fullName!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  signatureData!: string;
}

export class RequestQuoteSignOtpDto {
  @IsString()
  @IsNotEmpty()
  fullName!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  signatureData!: string;
}

export class VerifyQuoteSignOtpDto {
  @IsUUID()
  requestId!: string;

  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  code!: string;
}

export class ResendQuoteSignOtpDto {
  @IsUUID()
  requestId!: string;
}
