import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ReviewClassifyDto {
  @IsString()
  @IsNotEmpty()
  expenseAccountId!: string;

  @IsString()
  @IsNotEmpty()
  paymentAccountId!: string;

  @IsBoolean()
  @IsOptional()
  saveAsRule?: boolean;
}
