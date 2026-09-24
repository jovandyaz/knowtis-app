import { JwtAuthGuard } from '@jovandyaz/auth-nestjs';
import type { RequestUser } from '@jovandyaz/auth/server';
import { PoliciesGuard } from '@jovandyaz/permissions-nestjs';
import type {
  ExecutionContext,
  INestApplication,
  Provider,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ok } from 'neverthrow';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { SUPERTAGS } from '@knowtis/shared-types';

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
import { AnonymousNoteLimitGuard } from './guards/anonymous-note-limit.guard';
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
