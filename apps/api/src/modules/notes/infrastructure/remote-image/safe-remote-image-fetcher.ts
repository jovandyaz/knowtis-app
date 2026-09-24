import { request as httpRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';

import { err, ok, type Result } from 'neverthrow';
import { useAgent } from 'request-filtering-agent';

import { MAX_IMAGE_BYTES } from '@knowtis/shared-util';

import { sniffImageType } from '../../domain/image-type';
import {
  imageImportError,
  type FetchedImage,
  type ImageImportError,
  type ImageImportErrorCode,
  type RemoteImageFetcher,
} from '../../domain/ports/remote-image-fetcher.port';

const MAX_REDIRECTS = 3;
const IMPORT_TIMEOUT_MS = 10_000;
const HTTP_OK = 200;
const REDIRECT_STATUSES: ReadonlySet<number> = new Set([
  301, 302, 303, 307, 308,
]);
const FETCHABLE_PROTOCOLS: ReadonlySet<string> = new Set(['http:', 'https:']);
const REQUEST_HEADERS = {
  'User-Agent': 'Knowtis-ImageImport/1.0 (+https://knowtis.app)',
  Accept: 'image/*',
} as const;
// Matched by message because upstream refuses with a bare Error that has no code.
const BLOCKED_ADDRESS_MESSAGE = /^DNS lookup .+ is not allowed\./;

type ImportResult = Result<FetchedImage, ImageImportError>;

export interface SafeRemoteImageFetcherOptions {
  /** IPs or CIDRs the fetcher may reach although they are private, loopback or reserved. */
  readonly allowedIps: readonly string[];
  /** Budget for the whole import, redirects and body included. Defaults to 10 s. */
  readonly timeoutMs?: number;
}

/**
 * Downloads a remote image through request-filtering-agent, which checks the address
 * each hop resolves to when its socket connects, so neither a private address nor a
 * DNS-rebinding host is reached. Sends no cookie or credential, follows at most three
 * redirects, stops past `MAX_IMAGE_BYTES`, and types the body by its magic bytes.
 */
export class SafeRemoteImageFetcher implements RemoteImageFetcher {
  private readonly allowedIps: string[];
  private readonly timeoutMs: number;

  constructor({
    allowedIps,
    timeoutMs = IMPORT_TIMEOUT_MS,
  }: SafeRemoteImageFetcherOptions) {
    this.allowedIps = [...allowedIps];
    this.timeoutMs = timeoutMs;
  }

  async fetch(url: URL, signal: AbortSignal): Promise<ImportResult> {
    const deadline = AbortSignal.any([
      signal,
      AbortSignal.timeout(this.timeoutMs),
    ]);
    try {
      return await this.follow(url, deadline);
    } catch (error) {
      return err(imageImportError(failureCode(error, deadline)));
    }
  }

  private async follow(url: URL, signal: AbortSignal): Promise<ImportResult> {
    let target = url;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      const refusal = refusalOf(target);
      if (refusal !== null) {
        return err(imageImportError(refusal));
      }
      const response = await this.send(target, signal);
      const { location } = response.headers;
      if (
        !REDIRECT_STATUSES.has(response.statusCode ?? 0) ||
        location === undefined
      ) {
        return readImage(response);
      }
      response.destroy();
      target = new URL(location, target);
    }
    return err(imageImportError('fetch_failed'));
  }

  private send(url: URL, signal: AbortSignal): Promise<IncomingMessage> {
    const request = url.protocol === 'https:' ? httpsRequest : httpRequest;
    const agent = useAgent(url.href, {
      allowIPAddressList: this.allowedIps,
    });
    return new Promise((resolve, reject) => {
      request(url, { agent, headers: REQUEST_HEADERS, signal }, resolve)
        .on('error', reject)
        .end();
    });
  }
}

function refusalOf(url: URL): ImageImportErrorCode | null {
  if (!FETCHABLE_PROTOCOLS.has(url.protocol)) {
    return 'fetch_failed';
  }
  // Refused because Node would forward URL credentials as an Authorization header.
  if (url.username !== '' || url.password !== '') {
    return 'blocked_address';
  }
  return null;
}

async function readImage(response: IncomingMessage): Promise<ImportResult> {
  if (response.statusCode !== HTTP_OK) {
    response.destroy();
    return err(imageImportError('fetch_failed'));
  }
  const data = await readCapped(response);
  if (data === null) {
    return err(imageImportError('too_large'));
  }
  const mimeType = sniffImageType(data);
  return mimeType === null
    ? err(imageImportError('unsupported_type'))
    : ok({ data, mimeType });
}

async function readCapped(response: IncomingMessage): Promise<Buffer | null> {
  if (Number(response.headers['content-length']) > MAX_IMAGE_BYTES) {
    response.destroy();
    return null;
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of response as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > MAX_IMAGE_BYTES) {
      response.destroy();
      return null;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, size);
}

function failureCode(
  error: unknown,
  signal: AbortSignal
): ImageImportErrorCode {
  if (signal.aborted) {
    return 'timeout';
  }
  if (error instanceof Error && BLOCKED_ADDRESS_MESSAGE.test(error.message)) {
    return 'blocked_address';
  }
  return 'fetch_failed';
}
