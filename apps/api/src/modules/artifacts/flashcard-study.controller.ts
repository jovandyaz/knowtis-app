import { CurrentUser, JwtAuthGuard } from '@jovandyaz/auth-nestjs';
import type { RequestUser } from '@jovandyaz/auth/server';
import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { FEATURE_FLAG_KEYS } from '@knowtis/shared-types';

import { unwrapOrThrow } from '../../core/http/unwrap-or-throw';
import { FeatureFlagGuard, RequireFeatureFlag } from '../feature-flags';
import { ReviewCardHandler } from './application/commands/review-card.handler';
import { GetFlashcardProgressHandler } from './application/queries/get-flashcard-progress.handler';
import { GetStudySessionHandler } from './application/queries/get-study-session.handler';
import { GetStudyStatsHandler } from './application/queries/get-study-stats.handler';
import { ARTIFACT_ERROR_STATUS_MAP } from './artifact-error-status.map';
import { DEFAULT_STUDY_TIME_ZONE } from './domain/ports/artifact.repository';
import { ReviewCardDto, StudyQueryDto } from './dto/artifacts.dto';

@ApiTags('Artifacts - Flashcard Study')
@ApiBearerAuth()
@Controller('artifacts')
@UseGuards(JwtAuthGuard, FeatureFlagGuard)
@RequireFeatureFlag(FEATURE_FLAG_KEYS.AI_ENABLED)
export class FlashcardStudyController {
  constructor(
    private readonly getStudySessionHandler: GetStudySessionHandler,
    private readonly getStudyStatsHandler: GetStudyStatsHandler,
    private readonly getFlashcardProgressHandler: GetFlashcardProgressHandler,
    private readonly reviewCardHandler: ReviewCardHandler
  ) {}

  @ApiOperation({
    summary: 'Get the cross-deck study session: due cards, new cards and stats',
  })
  @Get('study/session')
  async getStudySession(
    @CurrentUser() user: RequestUser,
    @Query() query: StudyQueryDto
  ) {
    return this.getStudySessionHandler.execute({
      userId: user.id,
      timeZone: query.tz ?? DEFAULT_STUDY_TIME_ZONE,
    });
  }

  @ApiOperation({
    summary: 'Get study stats: due, new, reviewed today, streak',
  })
  @Get('study/stats')
  async getStudyStats(
    @CurrentUser() user: RequestUser,
    @Query() query: StudyQueryDto
  ) {
    return this.getStudyStatsHandler.execute({
      userId: user.id,
      timeZone: query.tz ?? DEFAULT_STUDY_TIME_ZONE,
    });
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
    return unwrapOrThrow(result, ARTIFACT_ERROR_STATUS_MAP);
  }
}
