import { JwtAuthGuard } from '@jovandyaz/auth-nestjs';
import { describe, expect, it } from 'vitest';

import { RolesGuard } from '../../../modules/authorization/roles.guard';
import { FeatureFlagsController } from '../feature-flags.controller';

function guardsOf(methodName: 'getAll' | 'upsert' | 'remove'): unknown[] {
  return (
    Reflect.getMetadata(
      '__guards__',
      FeatureFlagsController.prototype[methodName]
    ) ?? []
  );
}

describe('FeatureFlagsController guards', () => {
  it('should require JWT auth on the list endpoint', () => {
    expect(guardsOf('getAll')).toContain(JwtAuthGuard);
  });

  it('should keep admin gating on mutations', () => {
    expect(guardsOf('upsert')).toContain(JwtAuthGuard);
    expect(guardsOf('upsert')).toContain(RolesGuard);
    expect(guardsOf('remove')).toContain(JwtAuthGuard);
    expect(guardsOf('remove')).toContain(RolesGuard);
  });
});
