import { describe, expect, it } from 'vitest';

import { formatKeyHint } from './format-key-hint';

describe('formatKeyHint', () => {
  it('joins the prefix and suffix with an ellipsis', () => {
    expect(formatKeyHint('sk-ant-a', 'uAAA')).toBe('sk-ant-a…uAAA');
  });

  it('shows only the prefix when the key has no suffix', () => {
    expect(formatKeyHint('sk-ant-a', null)).toBe('sk-ant-a…');
  });
});
