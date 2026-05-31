import { httpClient } from './http-client';

export interface UploadImageResponse {
  id: string;
  url: string;
  width: number | null;
  height: number | null;
}

export interface UploadImageArgs {
  noteId: string;
  file: Blob;
  filename: string;
  width?: number;
  height?: number;
  signal?: AbortSignal;
}

export const imagesApi = {
  async upload({
    noteId,
    file,
    filename,
    width,
    height,
    signal,
  }: UploadImageArgs): Promise<UploadImageResponse> {
    const form = new FormData();
    form.append('file', file, filename);
    if (width !== undefined) {
      form.append('width', String(width));
    }
    if (height !== undefined) {
      form.append('height', String(height));
    }
    return httpClient.post<UploadImageResponse>(
      `/notes/${encodeURIComponent(noteId)}/images`,
      form,
      signal ? { signal } : undefined
    );
  },
};
