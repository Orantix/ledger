import { IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

export class CreateCapitalCommitmentDto {
  @IsString()
  @IsNotEmpty()
  shareholderName!: string;

  @IsNumber()
  @IsPositive()
  committedAmount!: number;

  @IsString()
  @IsOptional()
  currency?: string;
}
