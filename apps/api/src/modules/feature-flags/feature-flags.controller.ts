import { JwtAuthGuard } from '@jovandyaz/auth-nestjs';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { ApiAuthErrors, ApiBadRequest } from '../../core/swagger';
import { Roles, RolesGuard } from '../authorization/roles.guard';
import { FeatureFlagKeyParam } from './dto/feature-flag-key.param';
import { UpsertFeatureFlagDto } from './dto/feature-flags.dto';
import { FeatureFlagsService } from './feature-flags.service';

const flagSchema = {
  type: 'object',
  properties: {
    key: { type: 'string', example: 'ai_enabled' },
    enabled: { type: 'boolean', example: true },
    description: {
      type: 'string',
      nullable: true,
      example: 'Enables AI-powered text completion',
    },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

@ApiTags('Feature Flags')
@Controller('flags')
export class FeatureFlagsController {
  constructor(private readonly featureFlagsService: FeatureFlagsService) {}

  @ApiOperation({
    summary: 'List all feature flags',
    description:
      'Returns all feature flags and their current state. This endpoint is public and does not require authentication.',
  })
  @ApiResponse({
    status: 200,
    description: 'List of all feature flags',
    schema: { type: 'array', items: flagSchema },
  })
  @Get()
  async getAll() {
    return this.featureFlagsService.getAll();
  }

  @ApiOperation({
    summary: 'Create or update a feature flag',
    description:
      'Creates a new feature flag or updates an existing one. Requires admin role.',
  })
  @ApiBearerAuth()
  @ApiParam({
    name: 'key',
    type: 'string',
    description:
      'The feature flag key (lowercase alphanumeric with underscores)',
    example: 'ai_enabled',
  })
  @ApiBody({ type: UpsertFeatureFlagDto })
  @ApiResponse({
    status: 200,
    description: 'Feature flag created or updated',
    schema: flagSchema,
  })
  @ApiBadRequest('invalid key format or input')
  @ApiAuthErrors('user does not have admin role')
  @Put(':key')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async upsert(
    @Param() params: FeatureFlagKeyParam,
    @Body() dto: UpsertFeatureFlagDto
  ) {
    return this.featureFlagsService.toggle(
      params.key,
      dto.enabled,
      dto.description
    );
  }

  @ApiOperation({
    summary: 'Delete a feature flag',
    description: 'Permanently removes a feature flag. Requires admin role.',
  })
  @ApiBearerAuth()
  @ApiParam({
    name: 'key',
    type: 'string',
    description: 'The feature flag key to delete',
    example: 'ai_enabled',
  })
  @ApiResponse({ status: 204, description: 'Feature flag deleted' })
  @ApiAuthErrors('user does not have admin role')
  @Delete(':key')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param() params: FeatureFlagKeyParam) {
    await this.featureFlagsService.remove(params.key);
  }
}
