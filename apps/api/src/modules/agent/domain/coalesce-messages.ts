import type { AgentMessage } from './agent-message';

/** Merges consecutive same-role messages (content joined with a blank line) so
 * the sequence strictly alternates user/assistant — required by the Anthropic
 * provider, which rejects consecutive same-role turns. A HITL turn persists two
 * assistant rows (proposal preamble + post-approval text); this collapses them. */
export function coalesceMessages(
  messages: readonly AgentMessage[]
): AgentMessage[] {
  const out: AgentMessage[] = [];
  for (const m of messages) {
    const last = out[out.length - 1];
    if (last && last.role === m.role) {
      out[out.length - 1] = {
        role: last.role,
        content: `${last.content}\n\n${m.content}`,
      };
    } else {
      out.push({ role: m.role, content: m.content });
    }
  }
  return out;
}
