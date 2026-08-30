import { describe, expect, it } from 'vitest';

import {
  assertCountToolSelection,
  assertGrounding,
  assertNoSources,
  assertRecencyToolSelection,
  assertUpdateProposal,
  asTranscript,
} from './assertions';
import type { EvalTranscript } from './transcript';

function transcript(partial: Partial<EvalTranscript>): EvalTranscript {
  return {
    toolCalls: [],
    text: '',
    proposal: null,
    sources: [],
    error: null,
    stopReason: null,
    steps: [],
    ...partial,
  };
}

describe('asTranscript', () => {
  it('passes through an object', () => {
    const t = transcript({ text: 'hi' });
    expect(asTranscript(t)).toBe(t);
  });

  it('parses a JSON string', () => {
    const t = transcript({ text: 'hi' });
    expect(asTranscript(JSON.stringify(t))).toEqual(t);
  });

  it('returns an invalid-output transcript for malformed JSON instead of throwing', () => {
    const result = asTranscript('{ not json');
    expect(result.error?.code).toBe('INVALID_EVAL_OUTPUT');
    expect(result.toolCalls).toEqual([]);
    expect(result.sources).toEqual([]);
  });

  it('returns an invalid-output transcript for a wrong-shaped object', () => {
    expect(asTranscript({ foo: 'bar' }).error?.code).toBe(
      'INVALID_EVAL_OUTPUT'
    );
    expect(asTranscript(null).error?.code).toBe('INVALID_EVAL_OUTPUT');
  });

  it('lets predicates degrade to false on malformed output without throwing', () => {
    expect(() => assertGrounding('{ not json')).not.toThrow();
    expect(assertGrounding('{ not json')).toBe(false);
    expect(assertRecencyToolSelection({ foo: 1 })).toBe(false);
    expect(assertUpdateProposal(null)).toBe(false);
  });
});

describe('predicates', () => {
  it('recency requires listRecentNotes and forbids searchNotes', () => {
    expect(
      assertRecencyToolSelection(
        transcript({ toolCalls: [{ name: 'listRecentNotes', args: {} }] })
      )
    ).toBe(true);
    expect(
      assertRecencyToolSelection(
        transcript({ toolCalls: [{ name: 'searchNotes', args: {} }] })
      )
    ).toBe(false);
  });

  it('count requires getNotesOverview', () => {
    expect(
      assertCountToolSelection(
        transcript({ toolCalls: [{ name: 'getNotesOverview', args: {} }] })
      )
    ).toBe(true);
    expect(assertCountToolSelection(transcript({}))).toBe(false);
  });

  it('grounding requires searchNotes before getNote and non-empty sources', () => {
    expect(
      assertGrounding(
        transcript({
          toolCalls: [
            { name: 'searchNotes', args: {} },
            { name: 'getNote', args: {} },
          ],
          sources: [{ id: 'n1', title: 'N1' }],
        })
      )
    ).toBe(true);
    expect(
      assertGrounding(
        transcript({
          toolCalls: [
            { name: 'getNote', args: {} },
            { name: 'searchNotes', args: {} },
          ],
          sources: [{ id: 'n1', title: 'N1' }],
        })
      )
    ).toBe(false);
    expect(
      assertGrounding(
        transcript({
          toolCalls: [
            { name: 'searchNotes', args: {} },
            { name: 'getNote', args: {} },
          ],
          sources: [],
        })
      )
    ).toBe(false);
  });

  it('no-sources requires an empty sources array', () => {
    expect(assertNoSources(transcript({ sources: [] }))).toBe(true);
    expect(
      assertNoSources(transcript({ sources: [{ id: 'n1', title: 'N1' }] }))
    ).toBe(false);
  });

  it('update-proposal requires a non-null update proposal', () => {
    expect(
      assertUpdateProposal(
        transcript({ proposal: { kind: 'update', payload: {} } })
      )
    ).toBe(true);
    expect(
      assertUpdateProposal(
        transcript({ proposal: { kind: 'create', payload: {} } })
      )
    ).toBe(false);
    expect(assertUpdateProposal(transcript({ proposal: null }))).toBe(false);
  });
});
