import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { FeatureFlagKey } from '@knowtis/shared-types';

import { FeatureFlagsService } from './feature-flags.service';

export const FEATURE_FLAG_KEY = 'feature_flag';

export const RequireFeatureFlag = (flag: FeatureFlagKey) =>
  SetMetadata(FEATURE_FLAG_KEY, [flag]);

@Injectable()
export class FeatureFlagGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly featureFlags: FeatureFlagsService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredFlags = this.reflector.getAllAndMerge<FeatureFlagKey[]>(
      FEATURE_FLAG_KEY,
      [context.getHandler(), context.getClass()]
    );

    if (!requiredFlags || requiredFlags.length === 0) {
      return true;
    }

    for (const flag of requiredFlags) {
      const enabled = await this.featureFlags.isEnabled(flag);

      if (!enabled) {
        throw new ForbiddenException(`Feature '${flag}' is not enabled`);
      }
    }

    return true;
  }
}
