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

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FeatureFlagKeyParam } from './dto/feature-flag-key.param';
import { UpsertFeatureFlagDto } from './dto/feature-flags.dto';
import { FeatureFlagsService } from './feature-flags.service';

@Controller('flags')
export class FeatureFlagsController {
  constructor(private readonly featureFlagsService: FeatureFlagsService) {}

  @Get()
  async getAll() {
    return this.featureFlagsService.getAll();
  }

  @Put(':key')
  @UseGuards(JwtAuthGuard)
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

  @Delete(':key')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param() params: FeatureFlagKeyParam) {
    await this.featureFlagsService.remove(params.key);
  }
}
