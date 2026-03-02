import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

import { SUPPORTED_LANGUAGES } from '../domain/constants/supported-languages';
import { SUPPORTED_TONES } from '../domain/constants/supported-tones';
import { SUPPORTED_AI_ACTIONS } from '../domain/value-objects/ai-action.vo';

export class AICompleteDto {
  @IsString()
  @IsIn([...SUPPORTED_AI_ACTIONS])
  action!: string;

  @IsString()
  @MaxLength(50000)
  content!: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  selection?: string;

  @IsOptional()
  @IsString()
  @IsIn([...SUPPORTED_LANGUAGES])
  targetLanguage?: string;

  @IsOptional()
  @IsString()
  @IsIn([...SUPPORTED_TONES])
  targetTone?: string;
}
