import type { EvalTranscript } from './transcript';

const INVALID_TRANSCRIPT: EvalTranscript = {
  toolCalls: [],
  text: '',
  proposal: null,
  sources: [],
  error: { code: 'INVALID_EVAL_OUTPUT', message: 'output is not a transcript' },
  stopReason: null,
  steps: [],
};

export function asTranscript(output: unknown): EvalTranscript {
  let parsed: unknown = output;
  if (typeof output === 'string') {
    try {
      parsed = JSON.parse(output);
    } catch {
      return INVALID_TRANSCRIPT;
    }
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !Array.isArray((parsed as { toolCalls?: unknown }).toolCalls) ||
    !Array.isArray((parsed as { sources?: unknown }).sources)
  ) {
    return INVALID_TRANSCRIPT;
  }
  return parsed as EvalTranscript;
}

function toolNames(t: EvalTranscript): string[] {
  return t.toolCalls.map((c) => c.name);
}

export function assertRecencyToolSelection(output: unknown): boolean {
  const names = toolNames(asTranscript(output));
  return names.includes('listRecentNotes') && !names.includes('searchNotes');
}

export function assertCountToolSelection(output: unknown): boolean {
  return toolNames(asTranscript(output)).includes('getNotesOverview');
}

export function assertGrounding(output: unknown): boolean {
  const t = asTranscript(output);
  const names = toolNames(t);
  const searchIdx = names.indexOf('searchNotes');
  const getIdx = names.indexOf('getNote');
  const orderedFetch = searchIdx !== -1 && getIdx !== -1 && searchIdx < getIdx;
  return orderedFetch && t.sources.length > 0;
}

export function assertNoSources(output: unknown): boolean {
  return asTranscript(output).sources.length === 0;
}

export function assertUpdateProposal(output: unknown): boolean {
  const proposal = asTranscript(output).proposal;
  return proposal !== null && proposal.kind === 'update';
}
