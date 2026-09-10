import type { AgentMessage } from './agent-message';

/** Blank line joining two merged same-role messages; the guard must scan the joined text. */
export const COALESCED_MESSAGE_SEPARATOR = '\n\n';

/** Merges consecutive same-role text messages (content joined with a blank line) so
 * the sequence strictly alternates user/assistant — required by the Anthropic
 * provider, which rejects consecutive same-role turns. A HITL turn persists two
 * assistant rows (proposal preamble + post-approval text); this collapses them.
 * Messages carrying tool parts are never merged: an assistant→tool→assistant run
 * is valid as is, and merging would orphan the tool call from its result. */
export function coalesceMessages(
  messages: readonly AgentMessage[]
): AgentMessage[] {
  const out: AgentMessage[] = [];
  for (const m of messages) {
    const last = out[out.length - 1];
    if (last && last.role === m.role && !last.parts && !m.parts) {
      out[out.length - 1] = {
        role: last.role,
        content: `${last.content}${COALESCED_MESSAGE_SEPARATOR}${m.content}`,
      };
    } else {
      out.push(
        m.parts
          ? { role: m.role, content: m.content, parts: m.parts }
          : { role: m.role, content: m.content }
      );
    }
  }
  return out;
}
