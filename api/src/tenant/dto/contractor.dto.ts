import { IsArray, IsNotEmpty, IsOptional, IsString, IsUUID, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ContractorRequirementInput {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  isRequired?: boolean;
}

export class ContractorCreateDto {
  @IsString()
  @IsNotEmpty()
  email!: string;

  @IsString()
  @IsNotEmpty()
  fullName!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  companyName?: string;

  @IsOptional()
  @IsString()
  tradeType?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContractorRequirementInput)
  requirements?: ContractorRequirementInput[];
}

export class ContractorDocumentUploadDto {
  @IsUUID()
  requirementId!: string;

  @IsString()
  @IsNotEmpty()
  fileUrl!: string;
}

export class ContractorDocumentReviewDto {
  @IsString()
  @IsNotEmpty()
  status!: string;

  @IsOptional()
  @IsString()
  reviewerNotes?: string;
}

export class ContractorComplianceReviewDto {
  @IsString()
  @IsNotEmpty()
  status!: string;

  @IsOptional()
  @IsString()
  reviewerNotes?: string;
}

export class ContractorTrainingAckDto {
  @IsOptional()
  @IsString()
  signatureData?: string;
}
