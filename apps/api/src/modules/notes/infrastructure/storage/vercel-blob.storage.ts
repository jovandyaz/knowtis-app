import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { del, put } from '@vercel/blob';

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
