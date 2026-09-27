import { describe, expect, it } from 'vitest';

import { AI_MENU_CONTEXT, getAIActionsForContext } from './ai-actions.config';

describe('getAIActionsForContext', () => {
  it('offers the voice note action whenever the context allows it', () => {
    expect(
      getAIActionsForContext(AI_MENU_CONTEXT.CURSOR).some(
        (a) => a.kind === 'voiceNote'
      )
    ).toBe(true);
  });

  it('keeps every action in its declared context', () => {
    const cursor = getAIActionsForContext(AI_MENU_CONTEXT.CURSOR);
    const selection = getAIActionsForContext(AI_MENU_CONTEXT.SELECTION);

    expect(
      cursor.every((a) => a.contexts.includes(AI_MENU_CONTEXT.CURSOR))
    ).toBe(true);
    expect(
      selection.every((a) => a.contexts.includes(AI_MENU_CONTEXT.SELECTION))
    ).toBe(true);
  });
});
