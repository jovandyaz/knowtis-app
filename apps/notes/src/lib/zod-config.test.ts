import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import './zod-config';

describe('zod config', () => {
  it('never compiles schemas with new Function, which script-src forbids', () => {
    expect(z.config().jitless).toBe(true);
  });
});
