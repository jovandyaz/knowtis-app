import type { GhostTextStreamChunk, GhostTextStreamInput } from '../ghost-text';

/**
 * Provider input for AIBlock streams. The block only sends a topic as
 * `content`, so the input shape is a strict subset of the GhostText
 * contract — reusing the chunk type avoids needless divergence.
 */
export type AIBlockStreamInput = Pick<
  GhostTextStreamInput,
  'content' | 'signal'
>;

export type AIBlockStreamChunk = GhostTextStreamChunk;

export interface AIBlockProvider {
  stream(input: AIBlockStreamInput): AsyncIterable<AIBlockStreamChunk>;
}

export interface AIBlockStorage {
  provider: AIBlockProvider | null;
}
