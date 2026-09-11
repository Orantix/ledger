import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { AccountType } from '@prisma/client';

export class CreateAccountDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsEnum(AccountType)
  type!: AccountType;

  @IsBoolean()
  @IsOptional()
  sensitive?: boolean;

  @IsBoolean()
  @IsOptional()
  isCash?: boolean;
}
