import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { CashFlowCategory, FsStatement } from '@prisma/client';

export class UpsertFsMappingDto {
  @IsString()
  @IsNotEmpty()
  accountId!: string;

  @IsEnum(FsStatement)
  statement!: FsStatement;

  @IsString()
  @IsNotEmpty()
  section!: string;

  @IsString()
  @IsNotEmpty()
  noteLabel!: string;

  @IsEnum(CashFlowCategory)
  @IsOptional()
  cashFlowCategory?: CashFlowCategory;

  @IsInt()
  @IsOptional()
  sortOrder?: number;
}
