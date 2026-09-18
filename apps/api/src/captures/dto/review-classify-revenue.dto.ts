import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ReviewClassifyRevenueDto {
  @IsString()
  @IsNotEmpty()
  revenueAccountId!: string;

  @IsString()
  @IsNotEmpty()
  receivingAccountId!: string;

  @IsBoolean()
  @IsOptional()
  saveAsRule?: boolean;
}
