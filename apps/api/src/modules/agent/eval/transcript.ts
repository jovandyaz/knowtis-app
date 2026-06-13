import type { AgentEvent } from '../domain/agent-event';
import type { MutationKind } from '../domain/proposed-mutation';

export interface EvalTranscript {
  readonly toolCalls: { readonly name: string; readonly args: unknown }[];
  readonly text: string;
  readonly proposal: {
    readonly kind: MutationKind;
    readonly payload: unknown;
  } | null;
  readonly sources: { readonly id: string; readonly title: string }[];
  readonly error: { readonly code: string; readonly message: string } | null;
}

export type EventTranscript = Omit<EvalTranscript, 'toolCalls'>;

export async function drainEvents(
  events: AsyncIterable<AgentEvent>
): Promise<EventTranscript> {
  let text = '';
  let proposal: EventTranscript['proposal'] = null;
  let sources: EventTranscript['sources'] = [];
  let error: EventTranscript['error'] = null;

  for await (const event of events) {
    switch (event.type) {
      case 'chunk':
        text += event.text;
        break;
      case 'done':
        sources = event.sources.map((s) => ({ id: s.id, title: s.title }));
        break;
      case 'proposal':
        proposal = {
          kind: event.proposal.kind,
          payload: event.proposal.payload,
        };
        break;
      case 'committed':
        break;
      case 'aborted':
        break;
      case 'error':
        error = { code: event.error.code, message: event.error.message };
        break;
      default: {
        const _exhaustive: never = event;
        throw new Error(`Unhandled agent event: ${String(_exhaustive)}`);
      }
    }
  }

  return { text, proposal, sources, error };
}
