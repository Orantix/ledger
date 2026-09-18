import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class UpsertRevenueRuleDto {
  @IsString()
  @IsNotEmpty()
  category!: string;

  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  @IsString()
  @IsNotEmpty()
  revenueAccountId!: string;

  @IsString()
  @IsNotEmpty()
  receivingAccountId!: string;
}
