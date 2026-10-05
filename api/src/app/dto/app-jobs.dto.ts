import {
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

export class AppJobStatusDto {
  @IsString()
  @IsNotEmpty()
  status!: string;
}

export class AppJobUpdateDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  workDone?: string;

  @IsOptional()
  @IsString()
  productsUsed?: string;

  @IsOptional()
  @IsString()
  closureNotes?: string;

  @IsOptional()
  @IsArray()
  photoUrls?: string[];

  @IsOptional()
  @IsArray()
  photoLabels?: string[];

  @IsOptional()
  @IsString()
  customerSignatureData?: string;

  @IsOptional()
  @IsString()
  customerSignatureName?: string;

  @IsOptional()
  @IsString()
  clientTimestamp?: string;
}

export class AppJobExpenseDto {
  @IsString()
  @IsNotEmpty()
  @Length(2, 240)
  description!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(1000000)
  amount!: number;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  category?: string;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @IsOptional()
  @IsDateString()
  expenseDate?: string;

  @IsOptional()
  @IsString()
  receiptUrl?: string;

  @IsOptional()
  @IsString()
  customerSignatureData?: string;

  @IsOptional()
  @IsString()
  customerSignatureName?: string;
}

export class AppJobTimeEntryDto {
  @IsDateString()
  startTime!: string;

  @IsDateString()
  endTime!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
