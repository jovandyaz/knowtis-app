import { describe, expect, it } from 'vitest';

import { formatShortcut } from './format-shortcut';

const MAC_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15';
const WINDOWS_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0';

describe('formatShortcut', () => {
  it.each([
    ['Mod+B', '⌘B'],
    ['Mod+.', '⌘.'],
    ['Mod+Shift+S', '⇧⌘S'],
    ['Mod+Alt+C', '⌥⌘C'],
    ['Mod+Shift+Alt+P', '⌥⇧⌘P'],
  ])('writes %s as %s on macOS', (shortcut, expected) => {
    expect(formatShortcut(shortcut, MAC_UA)).toBe(expected);
  });

  it.each([
    ['Shift+Mod+S', '⇧⌘S'],
    ['Alt+Mod+C', '⌥⌘C'],
    ['Shift+Alt+Mod+P', '⌥⇧⌘P'],
    ['Alt+Shift+Mod+P', '⌥⇧⌘P'],
  ])(
    'orders the modifiers of %s the Apple way as %s on macOS',
    (shortcut, expected) => {
      expect(formatShortcut(shortcut, MAC_UA)).toBe(expected);
    }
  );

  it.each([
    ['Mod+B', 'Ctrl+B'],
    ['Mod+,', 'Ctrl+,'],
    ['Mod+Shift+S', 'Ctrl+Shift+S'],
    ['Mod+Alt+C', 'Ctrl+Alt+C'],
    ['Mod+Shift+Alt+P', 'Ctrl+Shift+Alt+P'],
  ])('writes %s as %s elsewhere', (shortcut, expected) => {
    expect(formatShortcut(shortcut, WINDOWS_UA)).toBe(expected);
  });
});
