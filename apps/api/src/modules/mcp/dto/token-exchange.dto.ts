import { IsString, MinLength } from 'class-validator';

export class TokenExchangeDto {
  @IsString()
  @MinLength(24, { message: 'API key must be at least 24 characters' })
  apiKey!: string;
}
