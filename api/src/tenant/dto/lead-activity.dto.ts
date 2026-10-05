import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class LeadActivityCreateDto {
  @IsString()
  @IsNotEmpty()
  type!: string;

  @IsString()
  @IsNotEmpty()
  message!: string;

  @IsOptional()
  metadata?: Record<string, unknown>;
}
