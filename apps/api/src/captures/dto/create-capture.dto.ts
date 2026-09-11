import {
  IsArray,
  IsEnum,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class CreateCaptureDto {
  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsISO8601()
  date!: string;

  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  @IsString()
  @IsNotEmpty()
  category!: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  currency?: string;

  @IsNumber()
  @IsPositive()
  @IsOptional()
  exchangeRate?: number;

  @IsString()
  @IsOptional()
  shareholderName?: string;

  // Attachments uploaded ahead of the capture (e.g. via OCR pre-fill) get
  // linked to it at creation time.
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  attachmentIds?: string[];
}
