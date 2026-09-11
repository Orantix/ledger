import { IsISO8601, IsNotEmpty, IsString } from 'class-validator';

export class CreatePeriodDto {
  @IsString()
  @IsNotEmpty()
  label!: string;

  @IsISO8601()
  startDate!: string;

  @IsISO8601()
  endDate!: string;
}
