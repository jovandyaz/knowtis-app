import { describe, expect, it } from 'vitest';

import { AI_MENU_CONTEXT, getAIActionsForContext } from './ai-actions.config';

const ids = (actions: { id: string }[]) => actions.map((a) => a.id);

describe('getAIActionsForContext', () => {
  it('offers the voice note action at the cursor when voice notes are enabled', () => {
    const actions = getAIActionsForContext(AI_MENU_CONTEXT.CURSOR, {
      voiceNotesEnabled: true,
    });

    expect(ids(actions)).toContain('ai-voice-note');
  });

  it('drops the voice note action when voice notes are disabled', () => {
    const actions = getAIActionsForContext(AI_MENU_CONTEXT.CURSOR, {
      voiceNotesEnabled: false,
    });

    expect(ids(actions)).not.toContain('ai-voice-note');
    expect(ids(actions)).toContain('ai-continue');
  });

  it('keeps every action in its declared context', () => {
    const cursor = getAIActionsForContext(AI_MENU_CONTEXT.CURSOR, {
      voiceNotesEnabled: true,
    });
    const selection = getAIActionsForContext(AI_MENU_CONTEXT.SELECTION, {
      voiceNotesEnabled: true,
    });

    expect(
      cursor.every((a) => a.contexts.includes(AI_MENU_CONTEXT.CURSOR))
    ).toBe(true);
    expect(
      selection.every((a) => a.contexts.includes(AI_MENU_CONTEXT.SELECTION))
    ).toBe(true);
  });
});
