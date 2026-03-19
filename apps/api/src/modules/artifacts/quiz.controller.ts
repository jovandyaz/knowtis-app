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

import { FeatureFlagGuard, RequireFeatureFlag } from '../feature-flags';
import {
  GetQuizAttemptsHandler,
  SubmitQuizAttemptHandler,
} from './application';
import { SubmitQuizDto } from './dto';
import { unwrapOrThrow } from './helpers';

@ApiTags('Artifacts - Quiz')
@ApiBearerAuth()
@Controller('artifacts')
@UseGuards(JwtAuthGuard, FeatureFlagGuard)
@RequireFeatureFlag(FEATURE_FLAG_KEYS.AI_ENABLED)
export class QuizController {
  constructor(
    private readonly submitQuizAttemptHandler: SubmitQuizAttemptHandler,
    private readonly getQuizAttemptsHandler: GetQuizAttemptsHandler
  ) {}

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
