import { CurrentUser, JwtAuthGuard } from '@jovandyaz/auth-nestjs';
import type { RequestUser } from '@jovandyaz/auth/server';
import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { FEATURE_FLAG_KEYS } from '@knowtis/shared-types';

import { unwrapOrThrow } from '../../core/http/unwrap-or-throw';
import { FeatureFlagGuard, RequireFeatureFlag } from '../feature-flags';
import {
  GetFlashcardProgressHandler,
  GetStudySessionHandler,
  ReviewCardHandler,
} from './application';
import { ARTIFACT_ERROR_STATUS_MAP } from './artifact-error-status.map';
import { ReviewCardDto } from './dto';

@ApiTags('Artifacts - Flashcard Study')
@ApiBearerAuth()
@Controller('artifacts')
@UseGuards(JwtAuthGuard, FeatureFlagGuard)
@RequireFeatureFlag(FEATURE_FLAG_KEYS.AI_ENABLED)
export class FlashcardStudyController {
  constructor(
    private readonly getStudySessionHandler: GetStudySessionHandler,
    private readonly getFlashcardProgressHandler: GetFlashcardProgressHandler,
    private readonly reviewCardHandler: ReviewCardHandler
  ) {}

  @ApiOperation({ summary: 'Get flashcard cards due for review' })
  @Get('study/due')
  async getDueCards(@CurrentUser() user: RequestUser) {
    return this.getStudySessionHandler.execute({ userId: user.id });
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
