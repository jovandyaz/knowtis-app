import { err, ok } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';

import { NoteErrorCodes } from '../../domain/errors/note.errors';
import { UpdateTagHandler } from './update-tag.handler';

const TAG = { id: 't1', ownerId: 'owner', path: 'work', color: null };

function buildRepo(overrides: Record<string, unknown> = {}) {
  return {
    findById: vi.fn().mockResolvedValue(TAG),
    findPathCollision: vi.fn().mockResolvedValue(null),
    renameBranch: vi.fn().mockResolvedValue(ok(undefined)),
    recolor: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('UpdateTagHandler', () => {
  it('should rename a branch the owner holds', async () => {
    const repo = buildRepo();

    const result = await new UpdateTagHandler(repo as never).execute({
      tagId: 't1',
      userId: 'owner',
      path: 'job',
    });

    expect(result.isOk()).toBe(true);
    expect(repo.renameBranch).toHaveBeenCalledWith(
      TAG,
      expect.objectContaining({ value: 'job' })
    );
  });

  it('should refuse a rename onto a path the owner already holds', async () => {
    const repo = buildRepo({
      findPathCollision: vi.fn().mockResolvedValue('job'),
    });

    const result = await new UpdateTagHandler(repo as never).execute({
      tagId: 't1',
      userId: 'owner',
      path: 'job',
    });

    expect(result._unsafeUnwrapErr().code).toBe(NoteErrorCodes.TAG_CONFLICT);
    expect(repo.renameBranch).not.toHaveBeenCalled();
  });

  it('should refuse to nest a branch inside itself', async () => {
    const repo = buildRepo();

    const result = await new UpdateTagHandler(repo as never).execute({
      tagId: 't1',
      userId: 'owner',
      path: 'work/alpha',
    });

    expect(result._unsafeUnwrapErr().code).toBe(NoteErrorCodes.INVALID_TAG);
    expect(repo.renameBranch).not.toHaveBeenCalled();
  });

  it('should surface a path claimed after the collision check as a conflict', async () => {
    const repo = buildRepo({
      renameBranch: vi
        .fn()
        .mockResolvedValue(
          err({ code: NoteErrorCodes.TAG_CONFLICT, message: 'x' })
        ),
    });

    const result = await new UpdateTagHandler(repo as never).execute({
      tagId: 't1',
      userId: 'owner',
      path: 'job',
    });

    expect(result._unsafeUnwrapErr().code).toBe(NoteErrorCodes.TAG_CONFLICT);
  });

  it('should leave the branch untouched when the path is unchanged', async () => {
    const repo = buildRepo();

    const result = await new UpdateTagHandler(repo as never).execute({
      tagId: 't1',
      userId: 'owner',
      path: 'work',
    });

    expect(result.isOk()).toBe(true);
    expect(repo.findPathCollision).not.toHaveBeenCalled();
    expect(repo.renameBranch).not.toHaveBeenCalled();
  });

  it('should reject a malformed path before probing for a collision', async () => {
    const repo = buildRepo();

    const result = await new UpdateTagHandler(repo as never).execute({
      tagId: 't1',
      userId: 'owner',
      path: 'Two Words',
    });

    expect(result._unsafeUnwrapErr().code).toBe(NoteErrorCodes.INVALID_TAG);
    expect(repo.findPathCollision).not.toHaveBeenCalled();
  });

  it('should recolor with the palette token the caller sent', async () => {
    const repo = buildRepo();

    await new UpdateTagHandler(repo as never).execute({
      tagId: 't1',
      userId: 'owner',
      color: 'green',
    });

    expect(repo.recolor).toHaveBeenCalledWith('t1', 'green');
  });

  it('should clear a colour when null is sent', async () => {
    const repo = buildRepo();

    await new UpdateTagHandler(repo as never).execute({
      tagId: 't1',
      userId: 'owner',
      color: null,
    });

    expect(repo.recolor).toHaveBeenCalledWith('t1', null);
  });

  it('should refuse a caller who does not own the tag', async () => {
    const repo = buildRepo();

    const result = await new UpdateTagHandler(repo as never).execute({
      tagId: 't1',
      userId: 'intruder',
      path: 'job',
    });

    expect(result._unsafeUnwrapErr().code).toBe(
      NoteErrorCodes.PERMISSION_DENIED
    );
    expect(repo.renameBranch).not.toHaveBeenCalled();
  });

  it('should report a missing tag as not found', async () => {
    const repo = buildRepo({ findById: vi.fn().mockResolvedValue(null) });

    const result = await new UpdateTagHandler(repo as never).execute({
      tagId: 'missing',
      userId: 'owner',
    });

    expect(result._unsafeUnwrapErr().code).toBe(NoteErrorCodes.TAG_NOT_FOUND);
  });
});
