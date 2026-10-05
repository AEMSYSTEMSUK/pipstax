import { IsNotEmpty, IsString } from 'class-validator';

export class PortalTicketCreateDto {
  @IsString()
  @IsNotEmpty()
  subject!: string;

  @IsString()
  @IsNotEmpty()
  message!: string;
}

export class PortalTicketReplyDto {
  @IsString()
  @IsNotEmpty()
  message!: string;
}
