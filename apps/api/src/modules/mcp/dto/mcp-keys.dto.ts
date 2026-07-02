import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

import { MCP_SCOPE_CSVS, type McpScopeCsv } from '../mcp-token';

export class CreateMcpKeyDto {
  @ApiProperty({
    description: 'Display name for the API key',
    example: 'My Claude Key',
    minLength: 1,
    maxLength: 100,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({
    description: 'Comma-separated scopes for the key',
    enum: MCP_SCOPE_CSVS,
    default: 'notes:read',
    example: 'notes:read,notes:write',
  })
  @IsOptional()
  @IsString()
  @IsIn(MCP_SCOPE_CSVS)
  scopes?: McpScopeCsv;
}
