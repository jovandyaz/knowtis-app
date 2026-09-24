import type { NoteImage } from '../../../database/schema';

/** What the API answers for a stored note image. */
export interface NoteImageView {
  readonly id: string;
  readonly url: string;
  readonly width: number | null;
  readonly height: number | null;
}

export function toNoteImageView(image: NoteImage): NoteImageView {
  return {
    id: image.id,
    url: image.url,
    width: image.width,
    height: image.height,
  };
}
