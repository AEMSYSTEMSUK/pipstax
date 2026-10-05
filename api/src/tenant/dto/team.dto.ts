import {
  ArrayNotEmpty,
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class TeamCreateDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  hourlyRate?: number;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  memberUserIds?: string[];
}

export class TeamUpdateDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  hourlyRate?: number | null;
}

export class TeamMembersUpdateDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  memberUserIds!: string[];
}
