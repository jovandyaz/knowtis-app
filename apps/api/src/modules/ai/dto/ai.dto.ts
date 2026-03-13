import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

import { AI_LANGUAGES, AI_TONES } from '@knowtis/shared-types';

import { SUPPORTED_AI_ACTIONS } from '../domain/value-objects/ai-action.vo';

export class AICompleteDto {
  @ApiProperty({
    description: 'The AI action to perform',
    enum: [...SUPPORTED_AI_ACTIONS],
    example: 'summarize',
  })
  @IsString()
  @IsIn([...SUPPORTED_AI_ACTIONS])
  action!: string;

  @ApiProperty({
    description: 'The text content to process',
    minLength: 1,
    maxLength: 50000,
    example: 'The quarterly results show significant growth in all segments...',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(50000)
  content!: string;

  @ApiPropertyOptional({
    description: 'Selected text within the content for targeted actions',
    maxLength: 10000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  selection?: string;

  @ApiPropertyOptional({
    description: 'Target language for translation action',
    enum: [...AI_LANGUAGES],
    example: 'Spanish',
  })
  @IsOptional()
  @IsString()
  @IsIn([...AI_LANGUAGES])
  targetLanguage?: string;

  @ApiPropertyOptional({
    description: 'Target tone for tone adjustment action',
    enum: [...AI_TONES],
    example: 'formal',
  })
  @IsOptional()
  @IsString()
  @IsIn([...AI_TONES])
  targetTone?: string;
}
