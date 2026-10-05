import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class AppDocumentUploadDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  fileUrl!: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  relatedEntityType?: string;

  @IsOptional()
  @IsString()
  relatedEntityId?: string;
}

export class AppContractorDocumentUploadDto {
  @IsString()
  @IsNotEmpty()
  requirementId!: string;

  @IsString()
  @IsNotEmpty()
  fileUrl!: string;
}

export class AppTrainingAckDto {
  @IsOptional()
  @IsString()
  acknowledgement?: string;

  @IsOptional()
  @IsString()
  signatureData?: string;

  @IsBoolean()
  @IsNotEmpty()
  acknowledged!: boolean;
}
