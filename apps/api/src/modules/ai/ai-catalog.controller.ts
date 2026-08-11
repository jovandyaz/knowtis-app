import { CurrentUser, JwtAuthGuard } from '@jovandyaz/auth-nestjs';
import type { RequestUser } from '@jovandyaz/auth/server';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
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
  CatalogModelDto,
  CatalogOverviewDto,
} from '@knowtis/shared-types';

import { ApiAuthErrors, ApiBadRequest } from '../../core/swagger';
import { Roles, RolesGuard } from '../authorization/roles.guard';
import { FeatureFlagGuard, RequireFeatureFlag } from '../feature-flags';
import { AiCatalogAdminService } from './application/services/ai-catalog-admin.service';
import { CatalogModelParamDto } from './dto/catalog-model-param.dto';
import { PromoteCatalogModelDto } from './dto/promote-catalog-model.dto';
import { UpdateCatalogCopyDto } from './dto/update-catalog-copy.dto';
import { UserScopedThrottlerGuard } from './guards/user-scoped-throttler.guard';

const AI_DISABLED = 'AI feature is disabled';
const UNKNOWN_MODEL = 'Unknown model id';

const READ_THROTTLE = { default: { limit: 30, ttl: 60000 } };
const MUTATION_THROTTLE = { default: { limit: 10, ttl: 60000 } };

@ApiTags('AI')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, FeatureFlagGuard, RolesGuard, UserScopedThrottlerGuard)
@RequireFeatureFlag('ai_enabled')
@Roles('admin')
@Controller('ai/catalog')
export class AiCatalogController {
  constructor(private readonly catalog: AiCatalogAdminService) {}

  @ApiOperation({
    summary: 'List the model catalog',
    description:
      'Promotion queue, live promoted models and the alerts still open.',
  })
  @ApiResponse({ status: 200, description: 'Catalog overview' })
  @ApiAuthErrors(AI_DISABLED)
  @Throttle(READ_THROTTLE)
  @Get()
  list(): Promise<CatalogOverviewDto> {
    return this.catalog.overview();
  }

  @ApiOperation({
    summary: 'Promote a catalog model',
    description:
      'Offers the model to users in the chosen tier. Pricing still decides who pays: above the free-tier ceiling it stays BYOK-only whatever the tier.',
  })
  @ApiResponse({ status: 200, description: 'The promoted model' })
  @ApiResponse({ status: 404, description: UNKNOWN_MODEL })
  @ApiBadRequest('invalid tier')
  @ApiAuthErrors(AI_DISABLED)
  @Throttle(MUTATION_THROTTLE)
  @Post(':id/promote')
  async promote(
    @CurrentUser() user: RequestUser,
    @Param() params: CatalogModelParamDto,
    @Body() dto: PromoteCatalogModelDto
  ): Promise<CatalogModelDto> {
    return this.found(
      await this.catalog.promote(params.id, dto.tier, user.id),
      params.id
    );
  }

  @ApiOperation({
    summary: 'Retire a catalog model',
    description: 'Withdraws the model from the picker and from config reads.',
  })
  @ApiResponse({ status: 200, description: 'The retired model' })
  @ApiResponse({ status: 404, description: UNKNOWN_MODEL })
  @ApiAuthErrors(AI_DISABLED)
  @Throttle(MUTATION_THROTTLE)
  @Post(':id/retire')
  async retire(
    @CurrentUser() user: RequestUser,
    @Param() params: CatalogModelParamDto
  ): Promise<CatalogModelDto> {
    return this.found(await this.catalog.retire(params.id, user.id), params.id);
  }

  @ApiOperation({
    summary: 'Edit the copy shown for a catalog model',
    description:
      'Admin-owned label and description. Once set they survive later syncs.',
  })
  @ApiResponse({ status: 200, description: 'The updated model' })
  @ApiResponse({ status: 404, description: UNKNOWN_MODEL })
  @ApiBadRequest('empty patch or field too long')
  @ApiAuthErrors(AI_DISABLED)
  @Throttle(MUTATION_THROTTLE)
  @Patch(':id')
  async updateCopy(
    @CurrentUser() user: RequestUser,
    @Param() params: CatalogModelParamDto,
    @Body() dto: UpdateCatalogCopyDto
  ): Promise<CatalogModelDto> {
    if (dto.label === undefined && dto.description === undefined) {
      throw new BadRequestException('Provide label, description, or both');
    }
    return this.found(
      await this.catalog.updateCopy(params.id, dto, user.id),
      params.id
    );
  }

  @ApiOperation({
    summary: 'Resolve a catalog alert',
    description:
      'Idempotent: an unknown or already resolved alert keeps its original resolution time.',
  })
  @ApiResponse({ status: 204, description: 'Alert resolved' })
  @ApiAuthErrors(AI_DISABLED)
  @Throttle(MUTATION_THROTTLE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('alerts/:id/resolve')
  resolveAlert(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseIntPipe) id: number
  ): Promise<void> {
    return this.catalog.resolveAlert(id, user.id);
  }

  private found(model: CatalogModelDto | null, id: string): CatalogModelDto {
    if (!model) {
      throw new NotFoundException(`Unknown catalog model: ${id}`);
    }
    return model;
  }
}
