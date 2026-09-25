import type { PluginKey } from '@tiptap/pm/state';
import type { SuggestionOptions } from '@tiptap/suggestion';
import { describe, expectTypeOf, it } from 'vitest';

import type { SuggestionMenuOptions } from './suggestion-menu';

type HostSuggestion = SuggestionMenuOptions['suggestion'];

describe('SuggestionMenuOptions', () => {
  it('accepts a config that names its trigger char and plugin key', () => {
    expectTypeOf<{
      char: string;
      pluginKey: PluginKey;
    }>().toExtend<HostSuggestion>();
  });

  it('rejects a config that would fall back to Tiptap defaults', () => {
    expectTypeOf<
      Omit<SuggestionOptions, 'editor'>
    >().not.toExtend<HostSuggestion>();
    expectTypeOf<{ char: string }>().not.toExtend<HostSuggestion>();
    expectTypeOf<{ pluginKey: PluginKey }>().not.toExtend<HostSuggestion>();
  });
});
