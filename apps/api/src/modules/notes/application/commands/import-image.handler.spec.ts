import { createServer, type Server } from 'node:http';

import { Logger } from '@nestjs/common';
import { err, ok } from 'neverthrow';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { STORED_IMAGE_HOST } from '@knowtis/shared-util';

import { NoteErrorCodes } from '../../domain';
import {
  IMAGE_IMPORT_ERROR_CODES,
  imageImportError,
  type RemoteImageFetcher,
} from '../../domain/ports/remote-image-fetcher.port';
import { SafeRemoteImageFetcher } from '../../infrastructure/remote-image/safe-remote-image-fetcher';
import { NoteImageStoreService } from '../services/note-image-store.service';
import { ImportImageHandler } from './import-image.handler';

const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
);
const REMOTE_URL = 'https://cdn.images.example.org/cats/tabby.png?sig=secret';
const STORED_URL = `https://${STORED_IMAGE_HOST}/notes/n1/photo-abc.png`;
const BLOB = {
  url: `https://${STORED_IMAGE_HOST}/notes/n1/imported-abc.png`,
  pathname: 'notes/n1/imported-abc.png',
};
const LOOPBACK = '127.0.0.1';
const TEST_BUDGET_MS = 3_000;

function setup(
  overrides: {
    ownerId?: string;
    hasAccess?: boolean;
    fetcher?: RemoteImageFetcher;
  } = {}
) {
  const noteRepo = {
    findById: vi
      .fn()
      .mockResolvedValue({ id: 'n1', ownerId: overrides.ownerId ?? 'owner' }),
  };
  const permRepo = {
    hasAccess: vi.fn().mockResolvedValue(overrides.hasAccess ?? false),
  };
  const delegate: RemoteImageFetcher = overrides.fetcher ?? {
    fetch: () =>
      Promise.resolve(ok({ data: PNG_BYTES, mimeType: 'image/png' as const })),
  };
  const fetcher = {
    fetch: vi.fn((url: URL, signal: AbortSignal) =>
      delegate.fetch(url, signal)
    ),
  };
  const storage = {
    upload: vi.fn().mockResolvedValue(BLOB),
    delete: vi.fn().mockResolvedValue(undefined),
  };
  const imageRepo = {
    create: vi
      .fn()
      .mockImplementation((row) => Promise.resolve({ id: 'img1', ...row })),
    findPathnamesByNote: vi.fn(),
  };
  const handler = new ImportImageHandler(
    noteRepo as never,
    permRepo as never,
    fetcher as never,
    new NoteImageStoreService(storage as never, imageRepo as never)
  );
  return { handler, noteRepo, fetcher, storage, imageRepo };
}

const input = {
  noteId: 'n1',
  userId: 'owner',
  url: REMOTE_URL,
  signal: new AbortController().signal,
};

function spyOnWarnings() {
  return vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ImportImageHandler', () => {
  it('stores the fetched image as imported.<type> and answers its id and url', async () => {
    const { handler, fetcher, storage, imageRepo } = setup();

    const result = await handler.execute(input);

    expect(result._unsafeUnwrap()).toEqual({
      id: 'img1',
      url: BLOB.url,
      width: null,
      height: null,
    });
    expect(fetcher.fetch).toHaveBeenCalledWith(
      new URL(REMOTE_URL),
      input.signal
    );
    expect(storage.upload).toHaveBeenCalledWith({
      noteId: 'n1',
      filename: 'imported.png',
      data: PNG_BYTES,
      contentType: 'image/png',
    });
    expect(imageRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        noteId: 'n1',
        userId: 'owner',
        mimeType: 'image/png',
        size: PNG_BYTES.byteLength,
        width: null,
        height: null,
      })
    );
  });

  it('lets an editor with access import', async () => {
    const { handler, storage } = setup({ ownerId: 'someone', hasAccess: true });

    const result = await handler.execute({ ...input, userId: 'editor' });

    expect(result.isOk()).toBe(true);
    expect(storage.upload).toHaveBeenCalled();
  });

  it('answers a URL already in the app blob store as it is, without fetching or storing', async () => {
    const { handler, fetcher, storage, imageRepo } = setup();

    const result = await handler.execute({ ...input, url: STORED_URL });

    expect(result._unsafeUnwrap()).toEqual({
      id: null,
      url: STORED_URL,
      width: null,
      height: null,
    });
    expect(fetcher.fetch).not.toHaveBeenCalled();
    expect(storage.upload).not.toHaveBeenCalled();
    expect(imageRepo.create).not.toHaveBeenCalled();
  });

  it.each(IMAGE_IMPORT_ERROR_CODES)(
    'returns the fetcher refusal %s, logs it with the host reduced, and stores nothing',
    async (code) => {
      const warn = spyOnWarnings();
      const { handler, storage } = setup({
        fetcher: {
          fetch: () => Promise.resolve(err(imageImportError(code))),
        },
      });

      const result = await handler.execute(input);

      expect(result._unsafeUnwrapErr()).toEqual(imageImportError(code));
      expect(warn).toHaveBeenCalledWith({
        event: 'notes.image_import.rejected',
        code,
        host: '*.example.org',
        noteId: 'n1',
        userId: 'owner',
        clientDisconnected: false,
      });
      expect(storage.upload).not.toHaveBeenCalled();
    }
  );

  it('refuses a URL the WHATWG parser rejects as fetch_failed without fetching', async () => {
    const warn = spyOnWarnings();
    const { handler, fetcher } = setup();

    const result = await handler.execute({
      ...input,
      url: 'http://xn--a.com/',
    });

    expect(result._unsafeUnwrapErr().code).toBe('fetch_failed');
    expect(fetcher.fetch).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith({
      event: 'notes.image_import.rejected',
      code: 'fetch_failed',
      host: null,
      noteId: 'n1',
      userId: 'owner',
      clientDisconnected: false,
    });
  });

  it('logs a fetch cut short by the client leaving as a disconnect', async () => {
    const warn = spyOnWarnings();
    const client = new AbortController();
    const { handler } = setup({
      fetcher: {
        fetch: (_url, signal) =>
          Promise.resolve(
            err(imageImportError(signal.aborted ? 'timeout' : 'fetch_failed'))
          ),
      },
    });
    client.abort();

    await handler.execute({ ...input, signal: client.signal });

    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'timeout', clientDisconnected: true })
    );
  });

  it('denies a user without write access before fetching', async () => {
    const { handler, fetcher } = setup({
      ownerId: 'someone',
      hasAccess: false,
    });

    const result = await handler.execute({ ...input, userId: 'intruder' });

    expect(result._unsafeUnwrapErr().code).toBe(
      NoteErrorCodes.PERMISSION_DENIED
    );
    expect(fetcher.fetch).not.toHaveBeenCalled();
  });

  it('errors when the note does not exist, before fetching', async () => {
    const { handler, noteRepo, fetcher } = setup();
    noteRepo.findById.mockResolvedValue(null);

    const result = await handler.execute(input);

    expect(result._unsafeUnwrapErr().code).toBe(NoteErrorCodes.NOTE_NOT_FOUND);
    expect(fetcher.fetch).not.toHaveBeenCalled();
  });

  it('checks access before answering a URL already in the blob store', async () => {
    const { handler } = setup({ ownerId: 'someone', hasAccess: false });

    const result = await handler.execute({
      ...input,
      userId: 'intruder',
      url: STORED_URL,
    });

    expect(result._unsafeUnwrapErr().code).toBe(
      NoteErrorCodes.PERMISSION_DENIED
    );
  });
});

describe('ImportImageHandler with the SSRF-filtering fetcher', () => {
  let server: Server;
  let port: number;
  let requests = 0;

  beforeAll(async () => {
    server = createServer((_request, response) => {
      requests += 1;
      response.writeHead(200, { 'Content-Type': 'image/png' }).end(PNG_BYTES);
    });
    await new Promise<void>((resolve) => server.listen(0, LOOPBACK, resolve));
    const address = server.address();
    port = typeof address === 'object' && address ? address.port : 0;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  const allowingLoopback = () =>
    new SafeRemoteImageFetcher({
      allowedIps: [LOOPBACK],
      timeoutMs: TEST_BUDGET_MS,
    });

  it('imports from the allow-listed server', async () => {
    requests = 0;
    const { handler } = setup({ fetcher: allowingLoopback() });

    const result = await handler.execute({
      ...input,
      url: `http://${LOOPBACK}:${port}/cat.png`,
    });

    expect(result.isOk()).toBe(true);
    expect(requests).toBe(1);
  });

  it('refuses a URL carrying credentials as blocked_address without connecting', async () => {
    spyOnWarnings();
    requests = 0;
    const { handler, storage } = setup({ fetcher: allowingLoopback() });

    const result = await handler.execute({
      ...input,
      url: `http://user:pass@${LOOPBACK}:${port}/cat.png`,
    });

    expect(result._unsafeUnwrapErr().code).toBe('blocked_address');
    expect(requests).toBe(0);
    expect(storage.upload).not.toHaveBeenCalled();
  });
});
