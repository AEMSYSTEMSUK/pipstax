import { IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class AppChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  currentPassword!: string;

  @IsString()
  @MinLength(6)
  newPassword!: string;
}

export class AppProfileUpdateDto {
  @IsString()
  @IsNotEmpty()
  fullName!: string;

  @IsString()
  @IsOptional()
  phone?: string;
}
