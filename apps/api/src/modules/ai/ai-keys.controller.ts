import { CurrentUser, JwtAuthGuard } from '@jovandyaz/auth-nestjs';
import type { RequestUser } from '@jovandyaz/auth/server';
import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';

import { FEATURE_FLAG_KEYS, type ProviderKeyInfo } from '@knowtis/shared-types';

import { FeatureFlagGuard, RequireFeatureFlag } from '../feature-flags';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import { ByokService } from './application/services/byok.service';
import { ProviderParamDto } from './dto/provider-param.dto';
import { SetProviderKeyDto } from './dto/set-provider-key.dto';

@UseGuards(JwtAuthGuard, FeatureFlagGuard)
@RequireFeatureFlag('ai_enabled')
@Controller('ai/keys')
export class AiKeysController {
  constructor(
    private readonly byok: ByokService,
    private readonly flags: FeatureFlagsService
  ) {}

  @Get()
  async list(@CurrentUser() user: RequestUser): Promise<ProviderKeyInfo[]> {
    await this.assertEnabled(user);
    return this.byok.listKeys(user.id);
  }

  @Put(':provider')
  async set(
    @CurrentUser() user: RequestUser,
    @Param() params: ProviderParamDto,
    @Body() dto: SetProviderKeyDto
  ): Promise<ProviderKeyInfo[]> {
    await this.assertEnabled(user);
    await this.byok.setKey(user.id, params.provider, dto.apiKey);
    return this.byok.listKeys(user.id);
  }

  @Delete(':provider')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: RequestUser,
    @Param() params: ProviderParamDto
  ): Promise<void> {
    await this.assertEnabled(user);
    await this.byok.deleteKey(user.id, params.provider);
  }

  private async assertEnabled(user: RequestUser): Promise<void> {
    if (user.isAnonymous) {
      throw new ForbiddenException('BYOK requires a registered account');
    }
    if (!(await this.flags.isEnabled(FEATURE_FLAG_KEYS.AGENT_BYOK))) {
      throw new ForbiddenException('BYOK is not enabled');
    }
  }
}
