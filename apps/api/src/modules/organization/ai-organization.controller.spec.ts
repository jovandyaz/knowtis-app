import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';

import { FEATURE_FLAG_KEYS } from '@knowtis/shared-types';

import { FEATURE_FLAG_KEY } from '../feature-flags/feature-flag.guard';
import { AiOrganizationController } from './ai-organization.controller';

describe('AiOrganizationController', () => {
  const reflector = new Reflector();

  const requiredFlags = () =>
    reflector.getAllAndMerge<string[]>(FEATURE_FLAG_KEY, [
      AiOrganizationController.prototype.suggest,
      AiOrganizationController,
    ]);

  it('requires only the AI kill switch', () => {
    expect(requiredFlags()).toEqual([FEATURE_FLAG_KEYS.AI_ENABLED]);
  });
});
