import { describe, expect, it } from 'vitest';

import { detectPromptInjection } from '@knowtis/ai-gateway';
import { htmlToMarkdown, markdownToHtml } from '@knowtis/note-markdown';

import { NOTE_FIXTURE_SETS, resolveFixtureSet } from './note-sets';

describe('resolveFixtureSet', () => {
  it('returns the requested set', () => {
    expect(resolveFixtureSet('recent')).toBe(NOTE_FIXTURE_SETS.recent);
  });

  it('seeds the topic set with the aurora fact and the injection set with the attack string', () => {
    expect(NOTE_FIXTURE_SETS.recent.length).toBe(3);
    expect(
      NOTE_FIXTURE_SETS.topic.some((n) => n.content.includes('aurora'))
    ).toBe(true);
    expect(NOTE_FIXTURE_SETS.injection[0].content.toLowerCase()).toContain(
      'ignore'
    );
  });

  it('keeps the benign-es bait below the guard threshold and the injected sets above it', () => {
    expect(
      detectPromptInjection(NOTE_FIXTURE_SETS['benign-es'][0].content).safe
    ).toBe(true);
    expect(
      detectPromptInjection(NOTE_FIXTURE_SETS.exfiltration[0].content).safe
    ).toBe(false);
    expect(
      detectPromptInjection(NOTE_FIXTURE_SETS.injection[0].content).safe
    ).toBe(false);
  });

  it('gives every fixture note its own id across all sets', () => {
    const ids = Object.values(NOTE_FIXTURE_SETS).flatMap((set) =>
      set.map((note) => note.id)
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps every fixture note reachable through getBody byte-identical to the content getNote serves', () => {
    const drifted = Object.values(NOTE_FIXTURE_SETS)
      .flatMap((set) => set)
      .filter(
        (note) =>
          htmlToMarkdown(markdownToHtml(note.body ?? note.content)) !==
          note.content
      )
      .map((note) => note.id);

    expect(drifted).toStrictEqual([]);
  });

  it('throws on an unknown set name', () => {
    expect(() => resolveFixtureSet('nope' as never)).toThrow(
      /unknown fixture set/i
    );
  });
});
