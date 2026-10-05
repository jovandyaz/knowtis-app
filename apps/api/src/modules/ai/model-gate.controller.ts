import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import type {
  ModelGateActiveDto,
  ModelGatePendingDto,
  ModelGateVerdictResultDto,
} from '@knowtis/shared-types';

import {
  ApiBadRequest,
  ApiNotFound,
} from '../../core/swagger/api-responses.decorator';
import { ModelGateService } from './application/services/model-gate.service';
import { ModelGateVerdictDto } from './dto/model-gate-verdict.dto';
import { ModelGateTokenGuard } from './model-gate-token.guard';

const MODEL_GATE_THROTTLE_LIMIT = 30;
const MODEL_GATE_THROTTLE_TTL_MS = 60_000;

/**
 * The eval gate's CI entry point. Authenticated by `MODEL_GATE_TOKEN` alone:
 * no user session and no `ai_enabled` flag, so the AI kill switch never
 * blocks a verdict.
 */
@ApiTags('AI')
@ApiBearerAuth()
@ApiResponse({ status: 401, description: 'Missing or wrong gate token' })
@ApiNotFound('MODEL_GATE_TOKEN is not configured')
@UseGuards(ModelGateTokenGuard)
@Throttle({
  default: {
    limit: MODEL_GATE_THROTTLE_LIMIT,
    ttl: MODEL_GATE_THROTTLE_TTL_MS,
  },
})
@Controller('internal/model-gate')
export class ModelGateController {
  constructor(private readonly gate: ModelGateService) {}

  @ApiOperation({
    summary: 'List the platform models awaiting an eval verdict',
    description:
      'One entry per selector whose pending model has no verdict yet; a model that failed is not listed again.',
  })
  @ApiResponse({ status: 200, description: 'Pending selectors' })
  @Get('pending')
  pending(): Promise<ModelGatePendingDto[]> {
    return this.gate.pending();
  }

  @ApiOperation({
    summary: 'Read the model each platform intent serves',
    description: 'Per intent, its pin when set, else its active resolution.',
  })
  @ApiResponse({ status: 200, description: 'Served model per intent' })
  @Get('active')
  active(): Promise<ModelGateActiveDto> {
    return this.gate.active();
  }

  @ApiOperation({
    summary: 'Record an eval gate verdict',
    description:
      'A pass activates the pending model unless another intent already serves it; a failure keeps it pending as failed. A verdict for a model no longer pending changes nothing and still answers 200.',
  })
  @ApiResponse({ status: 200, description: 'What the verdict did' })
  @ApiBadRequest('unknown selector, non-boolean passed or non-https run url')
  @HttpCode(HttpStatus.OK)
  @Post('verdict')
  verdict(
    @Body() dto: ModelGateVerdictDto
  ): Promise<ModelGateVerdictResultDto> {
    return this.gate.verdict(dto);
  }
}
