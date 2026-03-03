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
  @IsString()
  @IsIn([...SUPPORTED_AI_ACTIONS])
  action!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(50000)
  content!: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  selection?: string;

  @IsOptional()
  @IsString()
  @IsIn([...AI_LANGUAGES])
  targetLanguage?: string;

  @IsOptional()
  @IsString()
  @IsIn([...AI_TONES])
  targetTone?: string;
}
