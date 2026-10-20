import type { AgentMessagePart } from '../domain/agent-message';
import { FETCH_NOT_ALLOWED_NOTE } from '../infrastructure/tools/web.tool-group';

/** The output of every `toolName` result in `rows`, oldest first, as the model received it. */
export function toolOutputsNamed(
  rows: readonly { readonly parts?: readonly AgentMessagePart[] | null }[],
  toolName: string
): unknown[] {
  return rows.flatMap((row) =>
    (row.parts ?? []).flatMap((part) =>
      part.type === 'tool-result' && part.toolName === toolName
        ? [part.output]
        : []
    )
  );
}

/** The proposal id a propose tool answered with, or undefined for a refusal. */
export function proposalIdOf(output: unknown): string | undefined {
  return typeof output === 'object' &&
    output !== null &&
    'proposalId' in output &&
    typeof output.proposalId === 'string'
    ? output.proposalId
    : undefined;
}

/** What `webFetch` answers the model for a `url` its allowlist does not hold. */
export function refusedFetchOf(url: string): { note: string; url: string } {
  return { note: FETCH_NOT_ALLOWED_NOTE, url };
}
