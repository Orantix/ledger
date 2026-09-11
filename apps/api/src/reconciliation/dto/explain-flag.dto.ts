import { IsNotEmpty, IsString } from 'class-validator';

export class ExplainFlagDto {
  @IsString()
  @IsNotEmpty()
  explanation!: string;
}
