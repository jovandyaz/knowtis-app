import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class SetAIConfigDto {
  @ApiProperty({
    description: 'The configuration value to set',
    maxLength: 500,
    example: 'anthropic:claude-sonnet-5',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  value!: string;

  @ApiPropertyOptional({
    description: 'Optional description of the configuration key',
    maxLength: 200,
    example: 'Default model for AI completions',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;
}
