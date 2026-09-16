const MAC_USER_AGENT = /Mac/i;

export const MODIFIER_KEY_LABELS = { mac: '⌘', other: 'Ctrl' } as const;
export type ModifierKeyLabel =
  (typeof MODIFIER_KEY_LABELS)[keyof typeof MODIFIER_KEY_LABELS];

/** Defaults to the running browser's user agent; false outside a browser. */
export function isMacPlatform(userAgent?: string): boolean {
  const agent =
    userAgent ?? (typeof navigator === 'undefined' ? '' : navigator.userAgent);
  return MAC_USER_AGENT.test(agent);
}

export function modifierKeyLabel(userAgent?: string): ModifierKeyLabel {
  return isMacPlatform(userAgent)
    ? MODIFIER_KEY_LABELS.mac
    : MODIFIER_KEY_LABELS.other;
}
