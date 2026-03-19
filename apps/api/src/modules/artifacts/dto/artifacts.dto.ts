import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { ARTIFACT_TYPES, type ArtifactType } from '@knowtis/shared-types';

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
  @ApiProperty({ description: 'Array of answers', type: [QuizAnswerDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuizAnswerDto)
  answers!: QuizAnswerDto[];
}

export class LearnTopicDto {
  @ApiProperty({ description: 'Topic to learn about' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  topic!: string;
}

export class ArtifactsQueryDto {
  @ApiPropertyOptional({ description: 'Filter by note ID' })
  @IsOptional()
  @IsUUID()
  noteId?: string;
}
