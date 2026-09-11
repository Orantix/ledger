import { IsNotEmpty, IsNumber, IsPositive, IsString, Matches } from 'class-validator';

export class SetBudgetDto {
  @IsString()
  @IsNotEmpty()
  accountId!: string;

  @Matches(/^\d{4}-\d{2}$/, { message: 'month must be YYYY-MM' })
  month!: string;

  @IsNumber()
  @IsPositive()
  amount!: number;
}
