const SHARE_PERMISSIONS = ['viewer', 'editor'] as const;

type SharePermission = (typeof SHARE_PERMISSIONS)[number];

export interface ProposalPayloadView {
  readonly title?: string | undefined;
  readonly contentHtml?: string | undefined;
  readonly targetEmail?: string | undefined;
  readonly permission?: SharePermission | undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function readPermission(value: unknown): SharePermission | undefined {
  const text = readString(value);
  return SHARE_PERMISSIONS.find((permission) => permission === text);
}

export function readProposalPayload(
  payload: Record<string, unknown>
): ProposalPayloadView {
  return {
    title: readString(payload.title),
    contentHtml: readString(payload.contentHtml),
    targetEmail: readString(payload.targetEmail),
    permission: readPermission(payload.permission),
  };
}
