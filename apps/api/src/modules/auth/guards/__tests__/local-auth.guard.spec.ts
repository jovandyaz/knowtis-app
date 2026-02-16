import { AuthGuard } from '@nestjs/passport';
import { describe, expect, it } from 'vitest';

import { LocalAuthGuard } from '../local-auth.guard';

describe('LocalAuthGuard', () => {
  it('should be defined', () => {
    const guard = new LocalAuthGuard();
    expect(guard).toBeDefined();
  });

  it('should extend AuthGuard with local strategy', () => {
    const guard = new LocalAuthGuard();
    expect(guard).toBeInstanceOf(AuthGuard('local'));
  });

  it('should inherit canActivate from AuthGuard', () => {
    const guard = new LocalAuthGuard();
    expect(typeof guard.canActivate).toBe('function');
  });
});
