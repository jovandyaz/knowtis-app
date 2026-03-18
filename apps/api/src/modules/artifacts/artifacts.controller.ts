import { CurrentUser, JwtAuthGuard } from '@jovandyaz/auth-nestjs';
import type { RequestUser } from '@jovandyaz/auth/server';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Result } from 'neverthrow';

import { FEATURE_FLAG_KEYS } from '@knowtis/shared-types';

import { FeatureFlagGuard, RequireFeatureFlag } from '../feature-flags';
import { GetNoteHandler } from '../notes/application';
import { NoteErrorCodes } from '../notes/domain/errors/note.errors';
import {
  DeleteArtifactHandler,
  GenerateArtifactHandler,
  GetArtifactHandler,
  GetArtifactsHandler,
  GetFlashcardProgressHandler,
  GetQuizAttemptsHandler,
  GetStudySessionHandler,
  LearnTopicHandler,
  ReviewCardHandler,
  SubmitQuizAttemptHandler,
} from './application';
import { ArtifactErrorCodes, type ArtifactDomainError } from './domain';
import {
  ArtifactsQueryDto,
  GenerateArtifactDto,
  LearnTopicDto,
  ReviewCardDto,
  SubmitQuizDto,
} from './dto';

const ERROR_STATUS_MAP: Record<string, HttpStatus> = {
  [ArtifactErrorCodes.INVALID_ARTIFACT_TYPE]: HttpStatus.BAD_REQUEST,
  [ArtifactErrorCodes.ARTIFACT_NOT_FOUND]: HttpStatus.NOT_FOUND,
  [ArtifactErrorCodes.PERMISSION_DENIED]: HttpStatus.FORBIDDEN,
  [ArtifactErrorCodes.GENERATION_FAILED]: HttpStatus.BAD_GATEWAY,
  [ArtifactErrorCodes.INTERNAL_ERROR]: HttpStatus.INTERNAL_SERVER_ERROR,
};

function unwrapOrThrow<T>(result: Result<T, ArtifactDomainError>): T {
  if (result.isErr()) {
    const status =
      ERROR_STATUS_MAP[result.error.code] ?? HttpStatus.BAD_REQUEST;
    throw new HttpException(
      {
        statusCode: status,
        error: result.error.code,
        message: result.error.message,
      },
      status
    );
  }
  return result.value;
}

@ApiTags('Artifacts')
@ApiBearerAuth()
@Controller('artifacts')
@UseGuards(JwtAuthGuard, FeatureFlagGuard)
@RequireFeatureFlag(FEATURE_FLAG_KEYS.AI_ENABLED)
export class ArtifactsController {
  constructor(
    private readonly generateArtifactHandler: GenerateArtifactHandler,
    private readonly learnTopicHandler: LearnTopicHandler,
    private readonly getArtifactHandler: GetArtifactHandler,
    private readonly getArtifactsHandler: GetArtifactsHandler,
    private readonly deleteArtifactHandler: DeleteArtifactHandler,
    private readonly getStudySessionHandler: GetStudySessionHandler,
    private readonly getFlashcardProgressHandler: GetFlashcardProgressHandler,
    private readonly reviewCardHandler: ReviewCardHandler,
    private readonly submitQuizAttemptHandler: SubmitQuizAttemptHandler,
    private readonly getQuizAttemptsHandler: GetQuizAttemptsHandler,
    private readonly getNoteHandler: GetNoteHandler
  ) {}

  @ApiOperation({ summary: 'Generate an artifact from a note' })
  @Post('generate')
  async generate(
    @CurrentUser() user: RequestUser,
    @Body() dto: GenerateArtifactDto
  ) {
    const noteResult = await this.getNoteHandler.execute({
      noteId: dto.noteId,
      userId: user.id,
    });

    if (noteResult.isErr()) {
      throw new HttpException(
        {
          statusCode: HttpStatus.NOT_FOUND,
          error: NoteErrorCodes.NOTE_NOT_FOUND,
          message: noteResult.error.message,
        },
        HttpStatus.NOT_FOUND
      );
    }

    const note = noteResult.value;
    const result = await this.generateArtifactHandler.execute({
      userId: user.id,
      noteId: dto.noteId,
      noteContent: note.content ?? '',
      noteTitle: note.title,
      type: dto.type,
    });

    return unwrapOrThrow(result);
  }

  @ApiOperation({ summary: 'Generate educational content about a topic' })
  @Post('learn')
  async learnTopic(
    @CurrentUser() user: RequestUser,
    @Body() dto: LearnTopicDto
  ) {
    const result = await this.learnTopicHandler.execute({
      userId: user.id,
      topic: dto.topic,
    });
    return unwrapOrThrow(result);
  }

  @ApiOperation({ summary: 'List artifacts for the authenticated user' })
  @Get()
  async findAll(
    @CurrentUser() user: RequestUser,
    @Query() query: ArtifactsQueryDto
  ) {
    const result = await this.getArtifactsHandler.execute({
      userId: user.id,
      ...(query.noteId ? { noteId: query.noteId } : {}),
    });
    return unwrapOrThrow(result);
  }

  @ApiOperation({ summary: 'Get flashcard cards due for review' })
  @Get('study/due')
  async getDueCards(@CurrentUser() user: RequestUser) {
    return this.getStudySessionHandler.execute({ userId: user.id });
  }

  @ApiOperation({ summary: 'Get a single artifact by ID' })
  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser
  ) {
    const result = await this.getArtifactHandler.execute({
      artifactId: id,
      userId: user.id,
    });
    return unwrapOrThrow(result);
  }

  @ApiOperation({ summary: 'Delete an artifact' })
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser
  ) {
    const result = await this.deleteArtifactHandler.execute({
      artifactId: id,
      userId: user.id,
    });
    return unwrapOrThrow(result);
  }

  @ApiOperation({ summary: 'Get flashcard progress for a deck' })
  @Get(':id/progress')
  async getProgress(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser
  ) {
    return this.getFlashcardProgressHandler.execute({
      artifactId: id,
      userId: user.id,
    });
  }

  @ApiOperation({ summary: 'Submit a flashcard review' })
  @Post(':id/review')
  async reviewCard(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: ReviewCardDto
  ) {
    const result = await this.reviewCardHandler.execute({
      artifactId: id,
      userId: user.id,
      cardIndex: dto.cardIndex,
      quality: dto.quality,
    });
    return unwrapOrThrow(result);
  }

  @ApiOperation({ summary: 'Submit a quiz attempt' })
  @Post(':id/quiz-attempt')
  async submitQuizAttempt(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: SubmitQuizDto
  ) {
    const result = await this.submitQuizAttemptHandler.execute({
      artifactId: id,
      userId: user.id,
      answers: dto.answers,
    });
    return unwrapOrThrow(result);
  }

  @ApiOperation({ summary: 'Get quiz attempt history' })
  @Get(':id/quiz-attempts')
  async getQuizAttempts(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser
  ) {
    return this.getQuizAttemptsHandler.execute({
      artifactId: id,
      userId: user.id,
    });
  }
}
