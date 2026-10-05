import { IsNotEmpty, IsString } from 'class-validator';

export class TicketCreateDto {
  @IsString()
  @IsNotEmpty()
  subject!: string;

  @IsString()
  @IsNotEmpty()
  message!: string;

  @IsString()
  @IsNotEmpty()
  customerId!: string;
}

export class TicketMessageDto {
  @IsString()
  @IsNotEmpty()
  message!: string;
}
