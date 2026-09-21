import { describe, expect, it } from 'vitest';

import { detectPromptInjection } from '@knowtis/ai-gateway';
import { htmlToMarkdown, markdownToHtml } from '@knowtis/note-markdown';

import {
  MAX_NOTE_CONTENT_CHARS,
  TRUNCATION_MARKER,
} from '../../domain/retrieval';
import {
  LONG_NOTE_BODY,
  LONG_NOTE_SENTINEL,
  NOTE_FIXTURE_SETS,
  resolveFixtureSet,
} from './note-sets';

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

  it('keeps the Markdown getBody feeds the edit path byte-identical through the converter round trip', () => {
    const drifted = Object.values(NOTE_FIXTURE_SETS)
      .flatMap((set) => set)
      .filter((note) => {
        const source = note.body ?? note.content;
        return htmlToMarkdown(markdownToHtml(source)) !== source;
      })
      .map((note) => note.id);

    expect(drifted).toStrictEqual([]);
  });

  it('cuts the long note at the read bound and keeps its tail out of the served view', () => {
    const note = NOTE_FIXTURE_SETS['long-note'][0];

    expect(note.contentStatus).toBe('truncated');
    expect(note.body).toBe(LONG_NOTE_BODY);
    expect(note.content.length).toBe(
      MAX_NOTE_CONTENT_CHARS + TRUNCATION_MARKER.length
    );
    expect(LONG_NOTE_BODY.includes(LONG_NOTE_SENTINEL)).toBe(true);
    expect(note.content.includes(LONG_NOTE_SENTINEL)).toBe(false);
  });

  it('keeps the long note exact-matchable by round-tripping its whole body unchanged', () => {
    expect(htmlToMarkdown(markdownToHtml(LONG_NOTE_BODY))).toBe(LONG_NOTE_BODY);
  });

  it('throws on an unknown set name', () => {
    expect(() => resolveFixtureSet('nope' as never)).toThrow(
      /unknown fixture set/i
    );
  });
});
