import { describe, expect, it } from 'vitest';

import {
  CONVERSATION_TITLE_MAX,
  deriveConversationTitle,
  isValidConversationTitle,
  normalizeConversationTitle,
} from './conversation.types';

const SMILE = '🙂';

describe('normalizeConversationTitle', () => {
  it('should collapse every whitespace run to one space and trim the ends', () => {
    expect(normalizeConversationTitle('\n Plan\n\n  a   trip\t')).toBe(
      'Plan a trip'
    );
  });
});

describe('deriveConversationTitle', () => {
  it('should keep a short first message as it is', () => {
    expect(deriveConversationTitle('Plan a trip')).toBe('Plan a trip');
  });

  it('should cut at 120 code points without splitting an emoji', () => {
    const title = deriveConversationTitle(SMILE.repeat(125));

    expect(title).toBe(SMILE.repeat(120));
    expect([...title]).toHaveLength(120);
  });

  it('should drop the space the cut leaves at the end', () => {
    expect(deriveConversationTitle(`${'a'.repeat(119)} b`)).toBe(
      'a'.repeat(119)
    );
  });

  it('should fold a pasted multi-line message into one line', () => {
    expect(deriveConversationTitle('Summarize\nthis\n\nnote')).toBe(
      'Summarize this note'
    );
  });
});

describe('isValidConversationTitle', () => {
  it.each([
    ['', false],
    ['  \n ', false],
    ['a', true],
    ['  padded  ', true],
    ['x'.repeat(120), true],
    ['x'.repeat(121), false],
    [SMILE.repeat(120), true],
    [SMILE.repeat(121), false],
  ])('should judge %j as %s', (title, valid) => {
    expect(isValidConversationTitle(title)).toBe(valid);
  });

  it('should share its bound with the server', () => {
    expect(CONVERSATION_TITLE_MAX).toBe(120);
  });
});
