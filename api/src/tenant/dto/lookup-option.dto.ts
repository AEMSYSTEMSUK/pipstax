import { IsOptional, IsString, MaxLength } from 'class-validator';

export class LookupOptionCreateDto {
  @IsString()
  @MaxLength(120)
  title!: string;

  @IsString()
  @MaxLength(80)
  type!: string;
}

export class LookupOptionUpdateDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  type?: string;
}
