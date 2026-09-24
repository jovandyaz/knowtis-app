/** Image types a note accepts, as recognised from their bytes. SVG is never one: it can carry script. */
export const IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
] as const;

export type ImageMimeType = (typeof IMAGE_MIME_TYPES)[number];

/** File extension, without the dot, that names a stored image of each type. */
export const IMAGE_EXTENSIONS: Readonly<Record<ImageMimeType, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

/** Largest image a note stores, in bytes. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

type SignaturePart = readonly [offset: number, bytes: readonly number[]];
type Signature = readonly SignaturePart[];

const ascii = (text: string): readonly number[] =>
  Array.from(text, (char) => char.charCodeAt(0));

const IMAGE_SIGNATURES: Record<ImageMimeType, readonly Signature[]> = {
  'image/png': [[[0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]]]],
  'image/jpeg': [[[0, [0xff, 0xd8, 0xff]]]],
  'image/gif': [[[0, ascii('GIF87a')]], [[0, ascii('GIF89a')]]],
  'image/webp': [
    [
      [0, ascii('RIFF')],
      [8, ascii('WEBP')],
    ],
  ],
};

const matches = (data: Uint8Array, signature: Signature) =>
  signature.every(([offset, bytes]) =>
    bytes.every((byte, index) => data[offset + index] === byte)
  );

/**
 * Types an image by its magic bytes, never by a client-supplied header.
 * Returns null for anything that is not a PNG, JPEG, GIF or WebP, including truncated data.
 */
export function sniffImageType(data: Uint8Array): ImageMimeType | null {
  return (
    IMAGE_MIME_TYPES.find((type) =>
      IMAGE_SIGNATURES[type].some((signature) => matches(data, signature))
    ) ?? null
  );
}

/**
 * Gives `filename` the extension of `type`, replacing whatever extension it had
 * (`photo.gif` holding PNG bytes becomes `photo.png`) or appending one when it had none.
 */
export function imageFilename(filename: string, type: ImageMimeType): string {
  const dot = filename.lastIndexOf('.');
  const stem = dot > 0 ? filename.slice(0, dot) : filename;
  return `${stem}.${IMAGE_EXTENSIONS[type]}`;
}
