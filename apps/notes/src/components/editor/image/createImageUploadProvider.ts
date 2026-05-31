import { imagesApi } from '@knowtis/api-client';
import type { ImageUploadProvider } from '@knowtis/editor';

import { compressImage } from './compress';

export function createImageUploadProvider(
  getNoteId: () => string
): ImageUploadProvider {
  return async (file, signal) => {
    const compressed = await compressImage(file);
    const response = await imagesApi.upload({
      noteId: getNoteId(),
      file: compressed.blob,
      filename: compressed.filename,
      ...(compressed.width > 0 && { width: compressed.width }),
      ...(compressed.height > 0 && { height: compressed.height }),
      signal,
    });
    return {
      src: response.url,
      width: response.width,
      height: response.height,
      alt: compressed.filename.replace(/\.[^.]+$/, ''),
    };
  };
}
