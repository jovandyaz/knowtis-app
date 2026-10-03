import { describe, expect, it } from 'vitest';

import { toPickerLabel } from './index-label';

describe('toPickerLabel', () => {
  it('drops the trailing (latest) upstream appends to a name', () => {
    expect(toPickerLabel('Claude Haiku 4.5 (latest)')).toBe('Claude Haiku 4.5');
  });

  it('leaves a name without the suffix unchanged', () => {
    expect(toPickerLabel('Anthropic: Claude Haiku 4.5')).toBe(
      'Anthropic: Claude Haiku 4.5'
    );
  });

  it('keeps a (latest) that does not end the name', () => {
    expect(toPickerLabel('Claude (latest) Haiku')).toBe(
      'Claude (latest) Haiku'
    );
  });
});
