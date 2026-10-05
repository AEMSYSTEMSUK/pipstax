import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { IntegrationProvider } from '../../constants/integrations';

export class ConnectIntegrationDto {
  @IsEnum(IntegrationProvider)
  provider!: IntegrationProvider;

  @IsOptional()
  @IsString()
  authCode?: string;
}

export class CreateIntegrationFolderDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;
}
