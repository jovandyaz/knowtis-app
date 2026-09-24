import { imagesApi } from '@knowtis/api-client';
import type { ImageImportProvider } from '@knowtis/editor';

export function createImageImportProvider(
  getNoteId: () => string
): ImageImportProvider {
  return async (url, signal) => {
    const response = await imagesApi.import({
      noteId: getNoteId(),
      url,
      signal,
    });
    return {
      src: response.url,
      width: response.width,
      height: response.height,
      alt: '',
    };
  };
}
