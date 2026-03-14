import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { FeatureFlagsService } from './feature-flags.service';

export const FEATURE_FLAG_KEY = 'feature_flag';

export const RequireFeatureFlag = (flag: string) =>
  SetMetadata(FEATURE_FLAG_KEY, flag);

@Injectable()
export class FeatureFlagGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly featureFlags: FeatureFlagsService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredFlags = this.reflector.getAllAndMerge<string[]>(
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
