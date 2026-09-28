import { Injectable } from '@nestjs/common';

import type { ByokProvider } from '@knowtis/shared-types';

import { reasonOf } from '../../../../core/errors/reason-of';
import { AiUnavailableError } from '../../domain/errors/ai-unavailable.error';
import {
  PLATFORM_BILLING,
  type AiCaller,
  type AiExecutionContext,
} from '../../domain/execution-context/ai-execution-context';
import {
  TIER_POLICIES,
  type AccessTier,
} from '../../domain/execution-context/tier-policy';
import { ByokService } from './byok.service';

/**
 * Builds the caller's execution context once per request or turn; the
 * client never declares its own tier. Rejects with `AiUnavailableError`
 * when the key store fails.
 */
@Injectable()
export class TierResolver {
  constructor(private readonly byok: ByokService) {}

  async resolve(caller: AiCaller): Promise<AiExecutionContext> {
    const byokProviders = caller.isAnonymous
      ? new Set<ByokProvider>()
      : await this.storedKeyProviders(caller.userId);
    const tier: AccessTier = caller.isAnonymous
      ? 'anonymous'
      : byokProviders.size > 0
        ? 'byok'
        : 'free';
    return {
      subject: {
        userId: caller.userId,
        ...(caller.clientIp ? { clientIp: caller.clientIp } : {}),
      },
      tier,
      billing: PLATFORM_BILLING,
      policy: TIER_POLICIES[tier],
      byokProviders,
    };
  }

  private async storedKeyProviders(
    userId: string
  ): Promise<ReadonlySet<ByokProvider>> {
    try {
      return await this.byok.enabledProviders(userId);
    } catch (error) {
      throw new AiUnavailableError('tier', reasonOf(error), { cause: error });
    }
  }
}
