import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

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
    enum: ['read', 'read,write', 'read,write,share'],
    default: 'read',
    example: 'read,write',
  })
  @IsOptional()
  @IsString()
  @IsIn(['read', 'read,write', 'read,write,share'])
  scopes?: string;
}
