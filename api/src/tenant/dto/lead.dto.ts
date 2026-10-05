import {
  ArrayMaxSize,
  IsBoolean,
  IsArray,
  IsDateString,
  IsEmail,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { LeadStatus } from '../../constants/status';

export const leadSourceOptions = [
  'Web form',
  'Phone',
  'Referral',
  'Angi',
  'Thumbtack',
  'Walk-in',
  'Other',
] as const;

export type LeadSourceOption = (typeof leadSourceOptions)[number];

export class LeadCreateDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsEmail()
  @MaxLength(160)
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @IsIn(leadSourceOptions as readonly string[])
  source?: LeadSourceOption;

  @IsOptional()
  @IsIn(Object.values(LeadStatus))
  status?: LeadStatus;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  industry?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsUUID()
  assignedUserId?: string;
}

export class LeadUpdateDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @IsIn(leadSourceOptions as readonly string[])
  source?: LeadSourceOption;

  @IsOptional()
  @IsIn(Object.values(LeadStatus))
  status?: LeadStatus;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  industry?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsUUID()
  assignedUserId?: string;
}

export class LeadConvertDto {
  @IsString()
  location!: string;

  @IsOptional()
  @IsString()
  priority?: string;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @IsOptional()
  @IsDateString()
  scheduledEndAt?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsBoolean()
  bypassQuote?: boolean;
}

export class LeadAttachmentCreateDto {
  @IsOptional()
  @IsString()
  @MaxLength(180)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  category?: string;
}
