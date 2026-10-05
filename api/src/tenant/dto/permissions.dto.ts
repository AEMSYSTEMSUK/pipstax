import { IsObject, IsOptional, IsString, Length } from 'class-validator';

export class CreateRoleDto {
  @IsString()
  @Length(2, 120)
  name!: string;

  @IsOptional()
  @IsString()
  @Length(2, 60)
  code?: string;
}

export class UpdateRolePermissionsDto {
  @IsObject()
  permissions!: Record<string, boolean>;
}

export class UpdateUserPermissionsDto {
  @IsOptional()
  @IsObject()
  permissionsOverride?: Record<string, boolean>;
}
