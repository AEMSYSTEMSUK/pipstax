import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class PortalChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  currentPassword!: string;

  @IsString()
  @MinLength(6)
  newPassword!: string;
}
