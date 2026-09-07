import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

import {
  ARTIFACT_TYPES,
  QUIZ_ATTEMPT_SCOPES,
  type ArtifactType,
  type QuizAttemptScope,
} from '@knowtis/shared-types';

import { IsIanaTimeZone } from './is-iana-time-zone.validator';

export class GenerateArtifactDto {
  @ApiProperty({ description: 'Note ID to generate artifact from' })
  @IsUUID()
  noteId!: string;

  @ApiProperty({
    enum: ARTIFACT_TYPES,
    description: 'Type of artifact to generate',
  })
  @IsIn(ARTIFACT_TYPES)
  type!: ArtifactType;
}

export class ReviewCardDto {
  @ApiProperty({ description: 'Card index in the deck' })
  @IsInt()
  @Min(0)
  cardIndex!: number;

  @ApiProperty({
    description: 'Quality of recall (0-5)',
    minimum: 0,
    maximum: 5,
  })
  @IsInt()
  @Min(0)
  @Max(5)
  quality!: number;
}

export class QuizAnswerDto {
  @ApiProperty({ description: 'Index of the question being answered' })
  @IsInt()
  @Min(0)
  questionIndex!: number;

  @ApiProperty({ description: 'Index of the selected answer option' })
  @IsInt()
  @Min(0)
  selectedIndex!: number;
}

export class SubmitQuizDto {
  @ApiPropertyOptional({
    enum: QUIZ_ATTEMPT_SCOPES,
    description:
      'full grades the whole quiz and must answer every question; missed grades exactly the questions failed in the latest full attempt',
  })
  @IsOptional()
  @IsIn(QUIZ_ATTEMPT_SCOPES)
  scope?: QuizAttemptScope;

  @ApiProperty({ description: 'Array of answers', type: [QuizAnswerDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => QuizAnswerDto)
  answers!: QuizAnswerDto[];
}

export class ArtifactsQueryDto {
  @ApiPropertyOptional({ description: 'Filter by note ID' })
  @IsOptional()
  @IsUUID()
  noteId?: string;
}

export class StudyQueryDto {
  @ApiPropertyOptional({
    description:
      'IANA time zone used for "today" and the streak (defaults to UTC)',
    example: 'America/Mexico_City',
  })
  @IsOptional()
  @IsIanaTimeZone()
  tz?: string;
}
