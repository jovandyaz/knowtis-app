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
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { FEATURE_FLAG_KEYS } from '@knowtis/shared-types';

import { clientIpOf } from '../../core/http/client-ip';
import { unwrapOrThrow } from '../../core/http/unwrap-or-throw';
import { TierResolver } from '../ai/application/services/tier-resolver.service';
import { FeatureFlagGuard, RequireFeatureFlag } from '../feature-flags';
import { GetNoteHandler } from '../notes/application';
import { NoteErrorCodes } from '../notes/domain/errors/note.errors';
import { DeleteArtifactHandler } from './application/commands/delete-artifact.handler';
import { GenerateArtifactHandler } from './application/commands/generate-artifact.handler';
import { GetArtifactHandler } from './application/queries/get-artifact.handler';
import { GetArtifactsHandler } from './application/queries/get-artifacts.handler';
import { ARTIFACT_ERROR_STATUS_MAP } from './artifact-error-status.map';
import { ArtifactsQueryDto, GenerateArtifactDto } from './dto/artifacts.dto';

@ApiTags('Artifacts')
@ApiBearerAuth()
@Controller('artifacts')
@UseGuards(JwtAuthGuard, FeatureFlagGuard)
@RequireFeatureFlag(FEATURE_FLAG_KEYS.AI_ENABLED)
export class ArtifactsController {
  constructor(
    private readonly generateArtifactHandler: GenerateArtifactHandler,
    private readonly getArtifactHandler: GetArtifactHandler,
    private readonly getArtifactsHandler: GetArtifactsHandler,
    private readonly deleteArtifactHandler: DeleteArtifactHandler,
    private readonly getNoteHandler: GetNoteHandler,
    private readonly tierResolver: TierResolver
  ) {}

  @ApiOperation({ summary: 'Generate an artifact from a note' })
  @Post('generate')
  async generate(
    @CurrentUser() user: RequestUser,
    @Body() dto: GenerateArtifactDto,
    @Req() req: Request
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
    const execution = await this.tierResolver.resolve({
      userId: user.id,
      isAnonymous: user.isAnonymous === true,
      clientIp: clientIpOf(req),
    });
    const result = await this.generateArtifactHandler.execute({
      execution,
      noteId: dto.noteId,
      noteContent: note.content ?? '',
      noteTitle: note.title,
      type: dto.type,
    });

    return unwrapOrThrow(result, ARTIFACT_ERROR_STATUS_MAP);
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
    return unwrapOrThrow(result, ARTIFACT_ERROR_STATUS_MAP);
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
    return unwrapOrThrow(result, ARTIFACT_ERROR_STATUS_MAP);
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
    return unwrapOrThrow(result, ARTIFACT_ERROR_STATUS_MAP);
  }
}
