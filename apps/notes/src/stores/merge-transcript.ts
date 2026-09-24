import type { AgentChatMessage } from './agent.store';

interface LiveTurn {
  turnId: string;
  messages: AgentChatMessage[];
}

function turnsOf(live: readonly AgentChatMessage[]): LiveTurn[] {
  const turns: LiveTurn[] = [];
  for (const message of live) {
    if (message.turnId === undefined) {
      continue;
    }
    const last = turns.at(-1);
    if (last?.turnId === message.turnId) {
      last.messages.push(message);
    } else {
      turns.push({ turnId: message.turnId, messages: [message] });
    }
  }
  return turns;
}

function append(
  slots: Map<string, AgentChatMessage[]>,
  turnId: string,
  messages: readonly AgentChatMessage[]
): void {
  slots.set(turnId, [...(slots.get(turnId) ?? []), ...messages]);
}

/**
 * Places the thread the server stored next to the messages already on screen.
 * The transcript is authoritative for every turn it holds: its bubbles replace
 * all the live bubbles of that turn, except the turns in progress, whose live
 * bubbles are newer and always come last. Every other live turn keeps its
 * place on screen: right after the stored turn it followed, or right before
 * the stored turn it preceded when none came before it, or at the end when it
 * touches none. A live message without a turn id can only have come from an
 * earlier transcript, which this one supersedes.
 */
export function mergeTranscript(
  transcript: readonly AgentChatMessage[],
  live: readonly AgentChatMessage[],
  inProgressTurnIds: readonly string[] = []
): AgentChatMessage[] {
  const inProgress = new Set(inProgressTurnIds);
  const stored = transcript.filter(
    (message) => message.turnId === undefined || !inProgress.has(message.turnId)
  );
  const storedTurns = new Set(stored.map((message) => message.turnId));

  const turns = turnsOf(live);
  const previousStored: (string | undefined)[] = [];
  let previous: string | undefined;
  for (const turn of turns) {
    previousStored.push(previous);
    if (storedTurns.has(turn.turnId)) {
      previous = turn.turnId;
    }
  }
  const nextStored: (string | undefined)[] = [];
  let next: string | undefined;
  for (const turn of [...turns].reverse()) {
    nextStored.unshift(next);
    if (storedTurns.has(turn.turnId)) {
      next = turn.turnId;
    }
  }

  const before = new Map<string, AgentChatMessage[]>();
  const after = new Map<string, AgentChatMessage[]>();
  const tail: AgentChatMessage[] = [];
  const inProgressTail: AgentChatMessage[] = [];
  turns.forEach((turn, index) => {
    if (storedTurns.has(turn.turnId)) {
      return;
    }
    if (inProgress.has(turn.turnId)) {
      inProgressTail.push(...turn.messages);
      return;
    }
    const anchorAfter = previousStored[index];
    const anchorBefore = nextStored[index];
    if (anchorAfter !== undefined) {
      append(after, anchorAfter, turn.messages);
    } else if (anchorBefore !== undefined) {
      append(before, anchorBefore, turn.messages);
    } else {
      tail.push(...turn.messages);
    }
  });

  const lastIndexOfTurn = new Map<string, number>();
  stored.forEach((message, index) => {
    if (message.turnId !== undefined) {
      lastIndexOfTurn.set(message.turnId, index);
    }
  });
  const merged: AgentChatMessage[] = [];
  const opened = new Set<string>();
  stored.forEach((message, index) => {
    const { turnId } = message;
    if (turnId !== undefined && !opened.has(turnId)) {
      opened.add(turnId);
      merged.push(...(before.get(turnId) ?? []));
    }
    merged.push(message);
    if (turnId !== undefined && lastIndexOfTurn.get(turnId) === index) {
      merged.push(...(after.get(turnId) ?? []));
    }
  });
  return [...merged, ...tail, ...inProgressTail];
}
