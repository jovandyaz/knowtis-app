import { ok } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';

import type { NoteEntity } from './domain';
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
    (overrides['update'] ?? handler()) as never,
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
