/** Image types a note stores, as recognised from their bytes. SVG is never one: it can carry script. */
export const IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
] as const;

export type ImageMimeType = (typeof IMAGE_MIME_TYPES)[number];

/** Largest image a note stores, in bytes. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
