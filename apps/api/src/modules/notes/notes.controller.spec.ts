import { createServer, type Server } from 'node:http';

import { JwtAuthGuard } from '@jovandyaz/auth-nestjs';
import type { RequestUser } from '@jovandyaz/auth/server';
import { PoliciesGuard } from '@jovandyaz/permissions-nestjs';
import {
  Logger,
  type ExecutionContext,
  type INestApplication,
  type Provider,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { err, ok } from 'neverthrow';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { SUPERTAGS } from '@knowtis/shared-types';
import { STORED_IMAGE_HOST } from '@knowtis/shared-util';

import { createValidationPipe } from '../../config/validation-pipe';
import {
  CreateNoteHandler,
  DeleteNoteHandler,
  GetCollaboratorsHandler,
  GetNoteByTokenHandler,
  GetNoteCountsHandler,
  GetNoteHandler,
  GetNotesHandler,
  RestoreNoteHandler,
  RevokeAccessHandler,
  ShareNoteHandler,
  UpdateNoteHandler,
} from './application';
import { ImportImageHandler } from './application/commands/import-image.handler';
import { RotateShareLinkHandler } from './application/commands/rotate-share-link.handler';
import { UploadImageHandler } from './application/commands/upload-image.handler';
import { NoteImageStoreService } from './application/services/note-image-store.service';
import {
  NOTE_REPOSITORY,
  PERMISSION_REPOSITORY,
  type NoteEntity,
} from './domain';
import { MAX_IMAGE_BYTES } from './domain/image-type';
import { IMAGE_STORAGE } from './domain/ports/image-storage.port';
import { NOTE_IMAGE_REPOSITORY } from './domain/ports/note-image.repository';
import {
  imageImportError,
  REMOTE_IMAGE_FETCHER,
  type ImageImportErrorCode,
  type RemoteImageFetcher,
} from './domain/ports/remote-image-fetcher.port';
import { IMPORT_URL_MAX_LENGTH } from './dto/import-image.dto';
import { AnonymousNoteLimitGuard } from './guards/anonymous-note-limit.guard';
import { SafeRemoteImageFetcher } from './infrastructure/remote-image/safe-remote-image-fetcher';
import { NotesController } from './notes.controller';

const noteEntity: NoteEntity = {
  id: '3b9f1c52-6e4a-4f4e-9f0e-1c2d3e4f5a6b',
  title: 'Meeting Notes',
  content: '<p>Hello</p>',
  ownerId: '7c8d9e0f-1a2b-3c4d-5e6f-7a8b9c0d1e2f',
  generalAccess: 'restricted',
  generalAccessPermission: 'viewer',
  shareToken: null,
  editorsCanShare: false,
  bucket: null,
  supertag: null,
  supertagFields: null,
  yjsState: Buffer.from([1, 2, 3]),
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-02T00:00:00Z'),
};

function createController(overrides: Partial<Record<string, unknown>> = {}) {
  const handler = () => ({
    execute: vi.fn().mockResolvedValue(ok(noteEntity)),
  });
  return new NotesController(
    (overrides['create'] ?? handler()) as never,
    handler() as never,
    handler() as never,
    handler() as never,
    (overrides['update'] ?? handler()) as never,
    handler() as never,
    handler() as never,
    handler() as never,
    handler() as never,
    handler() as never,
    handler() as never,
    handler() as never,
    handler() as never,
    handler() as never
  );
}

const user = { id: noteEntity.ownerId, email: 'a@b.com', name: 'A' } as never;

describe('NotesController write responses', () => {
  it('create response does not carry yjsState', async () => {
    const controller = createController();

    const response = await controller.create(user, { title: 'Meeting Notes' });

    expect(response).not.toHaveProperty('yjsState');
    expect(response).toMatchObject({
      id: noteEntity.id,
      title: noteEntity.title,
      content: noteEntity.content,
      ownerId: noteEntity.ownerId,
    });
  });

  it('update response does not carry yjsState', async () => {
    const controller = createController();

    const response = await controller.update(noteEntity.id, user, {
      title: 'Renamed',
    });

    expect(response).not.toHaveProperty('yjsState');
    expect(response).toMatchObject({ id: noteEntity.id });
  });
});

const signedInUser: RequestUser = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'signed-in@test.local',
  name: 'Signed In',
  role: 'user',
};

const CONTROLLER_HANDLERS = [
  CreateNoteHandler,
  GetNotesHandler,
  GetNoteCountsHandler,
  GetNoteHandler,
  UpdateNoteHandler,
  DeleteNoteHandler,
  RestoreNoteHandler,
  ShareNoteHandler,
  RevokeAccessHandler,
  GetCollaboratorsHandler,
  GetNoteByTokenHandler,
  UploadImageHandler,
  ImportImageHandler,
  RotateShareLinkHandler,
];

function tokenOf(provider: Provider): unknown {
  return typeof provider === 'function' ? provider : provider.provide;
}

async function startNotesApp(providers: Provider[]): Promise<INestApplication> {
  const provided = new Set(providers.map(tokenOf));
  const moduleRef = await Test.createTestingModule({
    controllers: [NotesController],
    providers: [
      ...CONTROLLER_HANDLERS.filter((handler) => !provided.has(handler)).map(
        (handler) => ({ provide: handler, useValue: {} })
      ),
      ...providers,
    ],
  })
    .overrideGuard(JwtAuthGuard)
    .useValue({
      canActivate: (ctx: ExecutionContext) => {
        ctx.switchToHttp().getRequest().user = signedInUser;
        return true;
      },
    })
    .overrideGuard(PoliciesGuard)
    .useValue({ canActivate: () => true })
    .overrideGuard(AnonymousNoteLimitGuard)
    .useValue({ canActivate: () => true })
    .compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(createValidationPipe());
  await app.listen(0);
  return app;
}

describe('NotesController route order', () => {
  let app: INestApplication;
  let base: string;
  const getNoteCounts = vi.fn();
  const findOne = vi.fn();

  beforeAll(async () => {
    app = await startNotesApp([
      { provide: GetNoteCountsHandler, useValue: { execute: getNoteCounts } },
      { provide: GetNoteHandler, useValue: { execute: findOne } },
    ]);
    base = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  it('routes GET /notes/counts to the counts handler, not :id ParseUUIDPipe', async () => {
    getNoteCounts.mockResolvedValue(
      ok({ inbox: 0, projects: 0, areas: 0, resources: 0, archive: 0 })
    );

    const response = await fetch(`${base}/notes/counts`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      inbox: 0,
      projects: 0,
      areas: 0,
      resources: 0,
      archive: 0,
    });
    expect(getNoteCounts).toHaveBeenCalledWith({ userId: signedInUser.id });
    expect(findOne).not.toHaveBeenCalled();
  });

  it('routes GET /notes/supertags to the catalog, not :id ParseUUIDPipe', async () => {
    const response = await fetch(`${base}/notes/supertags`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(Object.keys(body)).toEqual([...SUPERTAGS]);
    expect(findOne).not.toHaveBeenCalled();
  });
});

const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
);

describe('POST /notes/:id/images', () => {
  let app: INestApplication;
  let base: string;
  const storage = {
    upload: vi.fn().mockResolvedValue({
      url: 'https://blob/notes/n1/photo-abc.png',
      pathname: 'notes/n1/photo-abc.png',
    }),
    delete: vi.fn(),
  };
  const imageRepo = {
    create: vi
      .fn()
      .mockImplementation((row) => Promise.resolve({ id: 'img1', ...row })),
    findPathnamesByNote: vi.fn(),
  };

  beforeAll(async () => {
    app = await startNotesApp([
      UploadImageHandler,
      NoteImageStoreService,
      {
        provide: NOTE_REPOSITORY,
        useValue: {
          findById: vi
            .fn()
            .mockResolvedValue({ id: noteEntity.id, ownerId: signedInUser.id }),
        },
      },
      { provide: PERMISSION_REPOSITORY, useValue: { hasAccess: vi.fn() } },
      { provide: IMAGE_STORAGE, useValue: storage },
      { provide: NOTE_IMAGE_REPOSITORY, useValue: imageRepo },
    ]);
    base = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function upload(data: Uint8Array, label: string, filename: string) {
    const form = new FormData();
    form.append(
      'file',
      new Blob([new Uint8Array(data)], { type: label }),
      filename
    );
    return fetch(`${base}/notes/${noteEntity.id}/images`, {
      method: 'POST',
      body: form,
    });
  }

  it.each(['image/gif', 'application/octet-stream'])(
    'stores a PNG sent as photo.gif and labelled %s as photo.png, image/png',
    async (label) => {
      const response = await upload(PNG_BYTES, label, 'photo.gif');

      expect(response.status).toBe(201);
      expect(storage.upload).toHaveBeenCalledWith(
        expect.objectContaining({
          filename: 'photo.png',
          contentType: 'image/png',
        })
      );
      expect(imageRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ mimeType: 'image/png' })
      );
    }
  );

  it('answers only the documented id, url and dimensions of the stored image', async () => {
    const form = new FormData();
    form.append('file', new Blob([PNG_BYTES], { type: 'image/png' }), 'p.png');
    form.append('width', '800');
    form.append('height', '600');

    const response = await fetch(`${base}/notes/${noteEntity.id}/images`, {
      method: 'POST',
      body: form,
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      id: 'img1',
      url: 'https://blob/notes/n1/photo-abc.png',
      width: 800,
      height: 600,
    });
  });

  it('stores a file of exactly MAX_IMAGE_BYTES', async () => {
    const atCap = Buffer.alloc(MAX_IMAGE_BYTES);
    PNG_BYTES.copy(atCap);

    const response = await upload(atCap, 'image/png', 'cap.png');

    expect(response.status).toBe(201);
    expect(storage.upload.mock.calls[0]?.[0].data.length).toBe(MAX_IMAGE_BYTES);
  });

  it('refuses a file over MAX_IMAGE_BYTES with 413 before the handler runs', async () => {
    const execute = vi.spyOn(app.get(UploadImageHandler), 'execute');

    const response = await upload(
      new Uint8Array(MAX_IMAGE_BYTES + 1),
      'image/png',
      'huge.png'
    );

    expect(response.status).toBe(413);
    expect(execute).not.toHaveBeenCalled();
    execute.mockRestore();
  });

  it('refuses a form without a file with 400 before the handler runs', async () => {
    const execute = vi.spyOn(app.get(UploadImageHandler), 'execute');
    const form = new FormData();
    form.append('width', '800');

    const response = await fetch(`${base}/notes/${noteEntity.id}/images`, {
      method: 'POST',
      body: form,
    });

    expect(response.status).toBe(400);
    expect(execute).not.toHaveBeenCalled();
    execute.mockRestore();
  });

  it('answers a text file labelled image/png with 422 unsupported_type', async () => {
    const response = await upload(
      Buffer.from('just some text'),
      'image/png',
      'photo.png'
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ code: 'unsupported_type' });
    expect(storage.upload).not.toHaveBeenCalled();
  });
});

describe('POST /notes/:id/images/import', () => {
  const LOOPBACK = '127.0.0.1';
  const BLOB = {
    url: `https://${STORED_IMAGE_HOST}/notes/n1/imported-abc.png`,
    pathname: 'notes/n1/imported-abc.png',
  };
  let app: INestApplication;
  let base: string;
  let imageServer: Server;
  let imageBase: string;
  let imageRequests = 0;
  const storage = { upload: vi.fn(), delete: vi.fn() };
  const imageRepo = {
    create: vi
      .fn()
      .mockImplementation((row) => Promise.resolve({ id: 'img1', ...row })),
    findPathnamesByNote: vi.fn(),
  };
  const safeFetcher: RemoteImageFetcher = new SafeRemoteImageFetcher({
    allowedIps: [LOOPBACK],
    timeoutMs: 3_000,
  });
  const fetcher = { fetch: vi.fn<RemoteImageFetcher['fetch']>() };

  beforeAll(async () => {
    imageServer = createServer((request, response) => {
      imageRequests += 1;
      const body = request.url?.startsWith('/cat.png')
        ? PNG_BYTES
        : 'not an image';
      response.writeHead(200, { 'Content-Type': 'image/png' }).end(body);
    });
    await new Promise<void>((resolve) =>
      imageServer.listen(0, LOOPBACK, resolve)
    );
    const address = imageServer.address();
    imageBase = `http://${LOOPBACK}:${typeof address === 'object' && address ? address.port : 0}`;

    app = await startNotesApp([
      ImportImageHandler,
      NoteImageStoreService,
      {
        provide: NOTE_REPOSITORY,
        useValue: {
          findById: vi
            .fn()
            .mockResolvedValue({ id: noteEntity.id, ownerId: signedInUser.id }),
        },
      },
      { provide: PERMISSION_REPOSITORY, useValue: { hasAccess: vi.fn() } },
      { provide: IMAGE_STORAGE, useValue: storage },
      { provide: NOTE_IMAGE_REPOSITORY, useValue: imageRepo },
      { provide: REMOTE_IMAGE_FETCHER, useValue: fetcher },
    ]);
    base = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
    await new Promise((resolve) => imageServer.close(resolve));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    imageRequests = 0;
    storage.upload.mockResolvedValue(BLOB);
    fetcher.fetch.mockImplementation((url, signal) =>
      safeFetcher.fetch(url, signal)
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function importImage(body: unknown, signal?: AbortSignal) {
    return fetch(`${base}/notes/${noteEntity.id}/images/import`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      ...(signal && { signal }),
    });
  }

  function longUrl(length: number) {
    const prefix = `${imageBase}/cat.png?pad=`;
    return prefix + 'a'.repeat(length - prefix.length);
  }

  it('copies the image into the blob store and answers only its id, url and dimensions', async () => {
    const response = await importImage({ url: `${imageBase}/cat.png` });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      id: 'img1',
      url: BLOB.url,
      width: null,
      height: null,
    });
    expect(imageRequests).toBe(1);
    expect(storage.upload).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: 'imported.png',
        contentType: 'image/png',
      })
    );
    expect(fetcher.fetch.mock.calls[0]?.[1].aborted).toBe(false);
  });

  it('stops the fetch when the client disconnects before the answer', async () => {
    fetcher.fetch.mockImplementation(
      (_url, signal) =>
        new Promise((resolve) => {
          signal.addEventListener(
            'abort',
            () => resolve(err(imageImportError('timeout'))),
            { once: true }
          );
        })
    );
    const client = new AbortController();

    const pending = importImage(
      { url: 'https://images.example.org/cat.png' },
      client.signal
    ).catch(() => undefined);
    await vi.waitFor(() => expect(fetcher.fetch).toHaveBeenCalled());
    const serverSignal = fetcher.fetch.mock.calls[0]?.[1];
    expect(serverSignal?.aborted).toBe(false);
    client.abort();
    await pending;

    await vi.waitFor(() => expect(serverSignal?.aborted).toBe(true));
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('answers a URL already in the blob store with a null id, fetching nothing', async () => {
    const stored = `https://${STORED_IMAGE_HOST}/notes/n1/photo-abc.png`;

    const response = await importImage({ url: stored });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      id: null,
      url: stored,
      width: null,
      height: null,
    });
    expect(fetcher.fetch).not.toHaveBeenCalled();
  });

  it.each([
    ['an ftp URL', 'ftp://images.example.org/cat.png'],
    ['a javascript URL', 'javascript:alert(1)'],
    ['a relative URL', '/cat.png'],
    ['a URL without a scheme', 'images.example.org/cat.png'],
    ['a host without a top-level domain', 'http://localhost/cat.png'],
    ['text that is no URL', 'not a url'],
  ])('refuses %s with 400 before the handler runs', async (_label, url) => {
    const response = await importImage({ url });

    expect(response.status).toBe(400);
    expect(fetcher.fetch).not.toHaveBeenCalled();
  });

  it('refuses a body without a url with 400', async () => {
    const response = await importImage({});

    expect(response.status).toBe(400);
    expect(fetcher.fetch).not.toHaveBeenCalled();
  });

  it(`refuses a URL longer than ${IMPORT_URL_MAX_LENGTH} characters with 400`, async () => {
    const response = await importImage({
      url: longUrl(IMPORT_URL_MAX_LENGTH + 1),
    });

    expect(response.status).toBe(400);
    expect(fetcher.fetch).not.toHaveBeenCalled();
  });

  it(`imports from a URL of exactly ${IMPORT_URL_MAX_LENGTH} characters`, async () => {
    const response = await importImage({ url: longUrl(IMPORT_URL_MAX_LENGTH) });

    expect(response.status).toBe(201);
  });

  it.each<[ImageImportErrorCode, ImageImportErrorCode]>([
    ['blocked_address', 'fetch_failed'],
    ['timeout', 'fetch_failed'],
    ['fetch_failed', 'fetch_failed'],
    ['too_large', 'too_large'],
    ['unsupported_type', 'unsupported_type'],
  ])(
    'answers the refusal %s with 422 %s and that code’s fixed message',
    async (refusal, answered) => {
      fetcher.fetch.mockResolvedValue(err(imageImportError(refusal)));

      const response = await importImage({
        url: 'https://images.example.org/cat.png',
      });

      expect(response.status).toBe(422);
      expect(await response.json()).toEqual({
        statusCode: 422,
        error: answered,
        code: answered,
        message: imageImportError(answered).message,
      });
      expect(storage.upload).not.toHaveBeenCalled();
    }
  );

  it('answers a URL carrying credentials with 422 fetch_failed, never connecting', async () => {
    const url = `${imageBase}/cat.png`.replace('://', '://user:pass@');

    const response = await importImage({ url });

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ code: 'fetch_failed' });
    expect(imageRequests).toBe(0);
  });

  it('answers bytes that are not an image, whatever their label, with 422 unsupported_type', async () => {
    const response = await importImage({ url: `${imageBase}/text.png` });

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ code: 'unsupported_type' });
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('answers a URL the validator accepts but WHATWG rejects with 422 fetch_failed', async () => {
    const privateUseCodePoint = '\u{E000}';

    const response = await importImage({
      url: `http://a${privateUseCodePoint}.com/`,
    });

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ code: 'fetch_failed' });
  });

  it('allows 20 imports per user per minute', () => {
    const route = NotesController.prototype.importImage;

    expect(Reflect.getMetadata('THROTTLER:LIMITdefault', route)).toBe(20);
    expect(Reflect.getMetadata('THROTTLER:TTLdefault', route)).toBe(60_000);
  });
});
