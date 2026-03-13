import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class TokenExchangeDto {
  @ApiProperty({
    description: 'MCP API key to exchange for a short-lived JWT token',
    example: 'knowtis_mcp_live_abc123...',
    minLength: 24,
  })
  @IsString()
  @MinLength(24, { message: 'API key must be at least 24 characters' })
  apiKey!: string;
}
