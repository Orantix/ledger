import { IsEnum, IsISO8601, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';
import { PaymentMethod } from '@prisma/client';

// Same shape as CreateCaptureDto, minus attachmentIds (attachments aren't
// re-linked on edit) and `type` (fixed at creation — see the schema
// comment on Capture.type for why) — every other field optional since this
// is a partial update.
export class UpdateCaptureDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  description?: string;

  @IsNumber()
  @IsPositive()
  @IsOptional()
  amount?: number;

  @IsISO8601()
  @IsOptional()
  date?: string;

  @IsEnum(PaymentMethod)
  @IsOptional()
  paymentMethod?: PaymentMethod;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  category?: string;

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

  @IsString()
  @IsOptional()
  customerName?: string;
}
