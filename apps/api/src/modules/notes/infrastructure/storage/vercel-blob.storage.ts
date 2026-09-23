import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { del, put } from '@vercel/blob';

import { isStoredImageUrl, STORED_IMAGE_HOST } from '@knowtis/shared-util';

import type { EnvConfig } from '../../../../config/env.config';
import type {
  ImageStorage,
  UploadedImage,
  UploadImageInput,
} from '../../domain/ports/image-storage.port';

@Injectable()
export class VercelBlobStorage implements ImageStorage {
  constructor(private readonly configService: ConfigService<EnvConfig, true>) {}

  async upload(input: UploadImageInput): Promise<UploadedImage> {
    const token = this.configService.getOrThrow('VERCEL_BLOB_READ_WRITE_TOKEN');
    const blob = await put(
      `notes/${input.noteId}/${input.filename}`,
      input.data,
      {
        access: 'public',
        addRandomSuffix: true,
        contentType: input.contentType,
        token,
      }
    );
    if (!isStoredImageUrl(blob.url)) {
      await del([blob.pathname], { token }).catch(() => undefined);
      throw new Error(
        `Uploaded image landed on ${new URL(blob.url).host}, not ${STORED_IMAGE_HOST}: VERCEL_BLOB_READ_WRITE_TOKEN belongs to another Blob store`
      );
    }
    return { url: blob.url, pathname: blob.pathname };
  }

  async delete(pathnames: string[]): Promise<void> {
    if (pathnames.length === 0) {
      return;
    }
    const token = this.configService.getOrThrow('VERCEL_BLOB_READ_WRITE_TOKEN');
    await del(pathnames, { token });
  }
}
