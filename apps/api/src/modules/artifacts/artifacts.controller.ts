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

import { FEATURE_FLAG_KEYS } from '@knowtis/shared-types';

import { FeatureFlagGuard, RequireFeatureFlag } from '../feature-flags';
import { GetNoteHandler } from '../notes/application';
import { NoteErrorCodes } from '../notes/domain/errors/note.errors';
import {
  DeleteArtifactHandler,
  GenerateArtifactHandler,
  GetArtifactHandler,
  GetArtifactsHandler,
  LearnTopicHandler,
} from './application';
import { ArtifactsQueryDto, GenerateArtifactDto, LearnTopicDto } from './dto';
import { unwrapOrThrow } from './helpers';

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
}
