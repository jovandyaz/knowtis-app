import type { AgentStopReason } from '@knowtis/shared-types';

import type { AgentEvent } from '../domain/agent-event';
import type { AgentMessage } from '../domain/agent-message';
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
  readonly stopReason: AgentStopReason | null;
  readonly steps: readonly (readonly AgentMessage[])[];
}

export type EventTranscript = Omit<EvalTranscript, 'toolCalls'>;

export async function drainEvents(
  events: AsyncIterable<AgentEvent>
): Promise<EventTranscript> {
  let text = '';
  let proposal: EventTranscript['proposal'] = null;
  let sources: EventTranscript['sources'] = [];
  let error: EventTranscript['error'] = null;
  let stopReason: AgentStopReason | null = null;
  const steps: (readonly AgentMessage[])[] = [];

  for await (const event of events) {
    switch (event.type) {
      case 'thinking':
        break;
      case 'chunk':
        text += event.text;
        break;
      case 'done':
        sources = event.sources.map((s) => ({ id: s.id, title: s.title }));
        stopReason = event.stopReason;
        break;
      case 'proposal':
        proposal = {
          kind: event.proposal.kind,
          payload: event.proposal.payload,
        };
        break;
      case 'step':
        steps.push(event.messages);
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

  return { text, proposal, sources, error, stopReason, steps };
}
