import { JwtAuthGuard } from '@jovandyaz/auth-nestjs';
import type { RequestUser } from '@jovandyaz/auth/server';
import { PoliciesGuard } from '@jovandyaz/permissions-nestjs';
import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ok } from 'neverthrow';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

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
import { UploadImageHandler } from './application/commands/upload-image.handler';
import type { NoteEntity } from './domain';
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

const routeOrderUser: RequestUser = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'route-order@test.local',
  name: 'Route Order',
  role: 'user',
};

describe('NotesController route order', () => {
  let app: INestApplication;
  let base: string;
  const getNoteCounts = vi.fn();
  const findOne = vi.fn();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [NotesController],
      providers: [
        { provide: CreateNoteHandler, useValue: {} },
        { provide: GetNotesHandler, useValue: {} },
        { provide: GetNoteCountsHandler, useValue: { execute: getNoteCounts } },
        { provide: GetNoteHandler, useValue: { execute: findOne } },
        { provide: UpdateNoteHandler, useValue: {} },
        { provide: DeleteNoteHandler, useValue: {} },
        { provide: RestoreNoteHandler, useValue: {} },
        { provide: ShareNoteHandler, useValue: {} },
        { provide: RevokeAccessHandler, useValue: {} },
        { provide: GetCollaboratorsHandler, useValue: {} },
        { provide: GetNoteByTokenHandler, useValue: {} },
        { provide: UploadImageHandler, useValue: {} },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          ctx.switchToHttp().getRequest().user = routeOrderUser;
          return true;
        },
      })
      .overrideGuard(PoliciesGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AnonymousNoteLimitGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    await app.listen(0);
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
    expect(getNoteCounts).toHaveBeenCalledWith({ userId: routeOrderUser.id });
    expect(findOne).not.toHaveBeenCalled();
  });
});
