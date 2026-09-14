import { IsString, Matches } from 'class-validator';

export class UpdateSettingsDto {
  // ISO 4217 alphabetic code, e.g. LKR, USD, EUR — always 3 uppercase letters.
  @IsString()
  @Matches(/^[A-Z]{3}$/, { message: 'baseCurrency must be a 3-letter ISO 4217 code, e.g. LKR, USD, EUR' })
  baseCurrency!: string;
}
