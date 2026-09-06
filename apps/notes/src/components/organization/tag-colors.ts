import type { TagColor } from '@knowtis/shared-types';

/**
 * Tailwind cannot see a class assembled at runtime, so each palette token maps
 * to its utilities explicitly.
 */
const TAG_COLOR_CLASSES: Record<TagColor, { text: string; swatch: string }> = {
  purple: { text: 'text-tag-purple', swatch: 'bg-tag-purple' },
  blue: { text: 'text-tag-blue', swatch: 'bg-tag-blue' },
  green: { text: 'text-tag-green', swatch: 'bg-tag-green' },
  yellow: { text: 'text-tag-yellow', swatch: 'bg-tag-yellow' },
  red: { text: 'text-tag-red', swatch: 'bg-tag-red' },
  pink: { text: 'text-tag-pink', swatch: 'bg-tag-pink' },
};

export function tagTextClass(color: TagColor | null): string | undefined {
  return color ? TAG_COLOR_CLASSES[color].text : undefined;
}

export function tagSwatchClass(color: TagColor | null): string {
  return color
    ? TAG_COLOR_CLASSES[color].swatch
    : 'border border-dashed border-muted-foreground';
}
