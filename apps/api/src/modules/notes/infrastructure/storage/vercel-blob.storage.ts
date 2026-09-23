import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { del, put } from '@vercel/blob';

import { isStoredImageUrl, STORED_IMAGE_HOST } from '@knowtis/shared-util';

import type { EnvConfig } from '../../../../config/env.config';
import { reasonOf } from '../../../../core/errors/reason-of';
import type {
  ImageStorage,
  UploadedImage,
  UploadImageInput,
} from '../../domain/ports/image-storage.port';

@Injectable()
export class VercelBlobStorage implements ImageStorage {
  private readonly logger = new Logger(VercelBlobStorage.name);

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
      await del([blob.pathname], { token }).catch((error: unknown) => {
        this.logger.warn(
          `Could not delete ${blob.pathname} from the foreign Blob store: ${reasonOf(error)}`
        );
      });
      throw new Error(
        `Uploaded image landed on ${hostOf(blob.url)}, not ${STORED_IMAGE_HOST}: VERCEL_BLOB_READ_WRITE_TOKEN belongs to another Blob store`
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

function hostOf(url: string): string {
  return URL.canParse(url) ? new URL(url).host : url;
}
