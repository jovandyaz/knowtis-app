import type { AgentChatMessage } from './agent.store';

/**
 * Places the thread the server stored next to the messages already on screen.
 * The transcript is authoritative for every turn it holds: its bubbles replace
 * all the live bubbles of that turn, except the turn still streaming, whose
 * live bubbles are newer. Live turns it does not hold follow it, in the order
 * they were sent. A live message without a turn id can only have come from an
 * earlier transcript, which this one supersedes.
 */
export function mergeTranscript(
  transcript: readonly AgentChatMessage[],
  live: readonly AgentChatMessage[],
  streamingTurnId?: string
): AgentChatMessage[] {
  const persisted = transcript.filter(
    (message) =>
      message.turnId === undefined || message.turnId !== streamingTurnId
  );
  const persistedTurns = new Set(persisted.map((message) => message.turnId));
  const unpersisted = live.filter(
    (message) =>
      message.turnId !== undefined && !persistedTurns.has(message.turnId)
  );
  return [...persisted, ...unpersisted];
}
