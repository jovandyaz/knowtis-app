import { useAIStore } from '@/stores/ai.store';
import { beforeEach, describe, expect, it } from 'vitest';

import { filterSlashCommands } from './slash-commands.config';

const ids = (items: { id: string }[]) => items.map((item) => item.id);

describe('filterSlashCommands', () => {
  beforeEach(() => {
    useAIStore.setState({ voiceNotesEnabled: false });
  });

  it('offers the voice note command when voice notes are enabled', () => {
    useAIStore.setState({ voiceNotesEnabled: true });

    expect(ids(filterSlashCommands(''))).toContain('ai-voice-note');
    expect(ids(filterSlashCommands('voz'))).toEqual(['ai-voice-note']);
  });

  it('drops the voice note command when voice notes are disabled', () => {
    expect(ids(filterSlashCommands(''))).not.toContain('ai-voice-note');
    expect(filterSlashCommands('voz')).toEqual([]);
  });

  it('keeps the other AI and formatting commands regardless of the flag', () => {
    const items = ids(filterSlashCommands(''));

    expect(items).toContain('ai-continue');
    expect(items).toContain('heading-1');
  });

  it('returns a stable list for an empty query so the menu keeps its selection', () => {
    expect(filterSlashCommands('')).toBe(filterSlashCommands(''));
  });
});
