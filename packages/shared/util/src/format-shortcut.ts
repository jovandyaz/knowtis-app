import { isMacPlatform } from './platform';

const KEY_SEPARATOR = '+';

const MAC_MODIFIERS = [
  { key: 'Alt', glyph: '⌥' },
  { key: 'Shift', glyph: '⇧' },
  { key: 'Mod', glyph: '⌘' },
] as const;

const OTHER_KEY_LABELS: Readonly<Record<string, string>> = { Mod: 'Ctrl' };

function isMacModifier(key: string): boolean {
  return MAC_MODIFIERS.some((modifier) => modifier.key === key);
}

/**
 * Writes a platform-neutral shortcut such as `Mod+Shift+S` (`Mod` is Cmd on
 * macOS and Ctrl elsewhere, as in Tiptap key bindings) in the notation of the
 * platform `userAgent` names. macOS gets glyphs in Apple's ⌥⇧⌘ order whatever
 * order the input uses (`⇧⌘S`); elsewhere the keys keep their order
 * (`Ctrl+Shift+S`). Defaults to the running browser's user agent.
 */
export function formatShortcut(shortcut: string, userAgent?: string): string {
  const keys = shortcut.split(KEY_SEPARATOR);
  if (isMacPlatform(userAgent)) {
    const glyphs = MAC_MODIFIERS.filter((modifier) =>
      keys.includes(modifier.key)
    ).map((modifier) => modifier.glyph);
    return [...glyphs, ...keys.filter((key) => !isMacModifier(key))].join('');
  }
  return keys.map((key) => OTHER_KEY_LABELS[key] ?? key).join(KEY_SEPARATOR);
}
