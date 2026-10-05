import { IsNotEmpty, IsOptional, IsString, IsBoolean, IsUUID } from 'class-validator';

export class RequirementCreateDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @IsUUID()
  contractorId!: string;
}
