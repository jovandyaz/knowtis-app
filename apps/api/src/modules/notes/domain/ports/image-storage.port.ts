export interface UploadImageInput {
  readonly noteId: string;
  readonly filename: string;
  readonly data: Buffer;
  readonly contentType: string;
}

export interface UploadedImage {
  readonly url: string;
  readonly pathname: string;
}

export interface ImageStorage {
  upload(input: UploadImageInput): Promise<UploadedImage>;
  delete(pathnames: string[]): Promise<void>;
}

export const IMAGE_STORAGE = Symbol('IMAGE_STORAGE');
