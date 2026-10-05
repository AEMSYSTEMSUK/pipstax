import { Type } from 'class-transformer';
import { IsArray, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { JobStatus } from '../../constants/status';

export class JobAssignDto {
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  userIds?: string[];

  @IsOptional()
  @IsString()
  assignmentType?: string;

  @IsOptional()
  @IsUUID('4')
  teamId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  hourlyRate?: number;
}

export class JobStatusUpdateDto {
  @IsString()
  @IsNotEmpty()
  status!: JobStatus;

  @IsOptional()
  @IsString()
  workflowStageKey?: string;
}
