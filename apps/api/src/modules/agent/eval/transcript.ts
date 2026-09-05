import type { AgentStopReason } from '@knowtis/shared-types';

import type { AgentEvent, AgentTurnUsage } from '../domain/agent-event';
import type { AgentMessage } from '../domain/agent-message';
import type { MutationKind } from '../domain/proposed-mutation';

export interface EvalTranscriptUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens?: number;
  readonly cacheWriteTokens?: number;
}

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
  /** Model that actually served the turn — differs from the requested one when the fallback chain took over. */
  readonly servedModel: string | null;
  readonly steps: readonly (readonly AgentMessage[])[];
  /** Turn totals from the terminal event; the event stream carries no per-step usage. */
  readonly usage: EvalTranscriptUsage | null;
  /** Derived from the catalog pricing of `servedModel`; null when usage or pricing is missing. */
  readonly costUsd: number | null;
}

export type EventTranscript = Omit<EvalTranscript, 'toolCalls' | 'costUsd'>;

function pickUsage(u: AgentTurnUsage): EvalTranscriptUsage {
  return {
    inputTokens: u.inputTokens,
    outputTokens: u.outputTokens,
    ...(u.cacheReadTokens !== undefined
      ? { cacheReadTokens: u.cacheReadTokens }
      : {}),
    ...(u.cacheWriteTokens !== undefined
      ? { cacheWriteTokens: u.cacheWriteTokens }
      : {}),
  };
}

export async function drainEvents(
  events: AsyncIterable<AgentEvent>
): Promise<EventTranscript> {
  let text = '';
  let proposal: EventTranscript['proposal'] = null;
  let sources: EventTranscript['sources'] = [];
  let error: EventTranscript['error'] = null;
  let stopReason: AgentStopReason | null = null;
  let servedModel: string | null = null;
  let usage: EvalTranscriptUsage | null = null;
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
        servedModel = event.usage.model;
        usage = pickUsage(event.usage);
        break;
      case 'proposal':
        proposal = {
          kind: event.proposal.kind,
          payload: event.proposal.payload,
        };
        servedModel = event.usage.model;
        usage = pickUsage(event.usage);
        break;
      case 'step':
        steps.push(event.messages);
        break;
      case 'aborted':
        servedModel = event.usage.model;
        usage = pickUsage(event.usage);
        break;
      case 'error':
        error = { code: event.error.code, message: event.error.message };
        servedModel = event.usage?.model ?? servedModel;
        usage = event.usage ? pickUsage(event.usage) : usage;
        break;
      default: {
        const _exhaustive: never = event;
        throw new Error(`Unhandled agent event: ${String(_exhaustive)}`);
      }
    }
  }

  return {
    text,
    proposal,
    sources,
    error,
    stopReason,
    servedModel,
    steps,
    usage,
  };
}
