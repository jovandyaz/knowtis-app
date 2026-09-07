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
import { SubmitQuizAttemptHandler } from './application/commands/submit-quiz-attempt.handler';
import { GetLatestQuizAttemptHandler } from './application/queries/get-latest-quiz-attempt.handler';
import { GetQuizAttemptsHandler } from './application/queries/get-quiz-attempts.handler';
import { ARTIFACT_ERROR_STATUS_MAP } from './artifact-error-status.map';
import { SubmitQuizDto } from './dto/artifacts.dto';

@ApiTags('Artifacts - Quiz')
@ApiBearerAuth()
@Controller('artifacts')
@UseGuards(JwtAuthGuard, FeatureFlagGuard)
@RequireFeatureFlag(FEATURE_FLAG_KEYS.AI_ENABLED)
export class QuizController {
  constructor(
    private readonly submitQuizAttemptHandler: SubmitQuizAttemptHandler,
    private readonly getQuizAttemptsHandler: GetQuizAttemptsHandler,
    private readonly getLatestQuizAttemptHandler: GetLatestQuizAttemptHandler
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
      ...(dto.scope ? { scope: dto.scope } : {}),
      answers: dto.answers,
    });
    return unwrapOrThrow(result, ARTIFACT_ERROR_STATUS_MAP);
  }

  @ApiOperation({
    summary: 'Get the latest full quiz attempt expanded for review',
  })
  @Get(':id/quiz-attempts/latest')
  async getLatestQuizAttempt(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser
  ) {
    const result = await this.getLatestQuizAttemptHandler.execute({
      artifactId: id,
      userId: user.id,
    });
    return unwrapOrThrow(result, ARTIFACT_ERROR_STATUS_MAP);
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
