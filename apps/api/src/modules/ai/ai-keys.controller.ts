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
import { Throttle } from '@nestjs/throttler';

import type { ProviderKeyInfo } from '@knowtis/shared-types';

import { FeatureFlagGuard, RequireFeatureFlag } from '../feature-flags';
import { ByokService } from './application/services/byok.service';
import { ProviderParamDto } from './dto/provider-param.dto';
import { SetProviderKeyDto } from './dto/set-provider-key.dto';

@UseGuards(JwtAuthGuard, FeatureFlagGuard)
@RequireFeatureFlag('ai_enabled')
@Controller('ai/keys')
export class AiKeysController {
  constructor(private readonly byok: ByokService) {}

  @Get()
  async list(@CurrentUser() user: RequestUser): Promise<ProviderKeyInfo[]> {
    this.assertRegistered(user);
    return this.byok.listKeys(user.id);
  }

  @Put(':provider')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async set(
    @CurrentUser() user: RequestUser,
    @Param() params: ProviderParamDto,
    @Body() dto: SetProviderKeyDto
  ): Promise<ProviderKeyInfo[]> {
    this.assertRegistered(user);
    await this.byok.setKey(user.id, params.provider, dto.apiKey);
    return this.byok.listKeys(user.id);
  }

  @Delete(':provider')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: RequestUser,
    @Param() params: ProviderParamDto
  ): Promise<void> {
    this.assertRegistered(user);
    await this.byok.deleteKey(user.id, params.provider);
  }

  private assertRegistered(user: RequestUser): void {
    if (user.isAnonymous === true) {
      throw new ForbiddenException('BYOK requires a registered account');
    }
  }
}
