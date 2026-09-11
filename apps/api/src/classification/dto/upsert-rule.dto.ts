import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class UpsertRuleDto {
  @IsString()
  @IsNotEmpty()
  category!: string;

  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  @IsString()
  @IsNotEmpty()
  expenseAccountId!: string;

  @IsString()
  @IsNotEmpty()
  paymentAccountId!: string;
}
