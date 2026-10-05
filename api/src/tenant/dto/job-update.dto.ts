import { IsArray, IsOptional, IsString } from 'class-validator';
import { JobStatus } from '../../constants/status';

export class JobUpdateCreateDto {
  @IsOptional()
  @IsString()
  status?: JobStatus;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  photoUrls?: string[];

  @IsOptional()
  @IsArray()
  photoLabels?: string[];

  @IsOptional()
  @IsArray()
  photoNames?: string[];

  @IsOptional()
  @IsString()
  customerSignatureData?: string;

  @IsOptional()
  @IsString()
  customerSignatureName?: string;

  @IsOptional()
  @IsString()
  clientTimestamp?: string;
}
