import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { MemoryController } from './memory.controller';

const user = { id: 'u1' } as never;

describe('MemoryController', () => {
  it('lists the caller own memories', async () => {
    const repo = {
      listForUser: vi.fn().mockResolvedValue([{ id: 'm1', content: 'x' }]),
    };
    const c = new MemoryController(repo as never, { get: () => 100 } as never);
    expect(await c.list(user)).toEqual([{ id: 'm1', content: 'x' }]);
    expect(repo.listForUser).toHaveBeenCalledWith('u1', 100);
  });

  it('deletes one and reports not found when not owned', async () => {
    const repo = { deleteForUser: vi.fn().mockResolvedValue(false) };
    const c = new MemoryController(repo as never, { get: () => 100 } as never);
    await expect(c.deleteOne(user, 'mX')).rejects.toThrow(NotFoundException);
    expect(repo.deleteForUser).toHaveBeenCalledWith('u1', 'mX');
  });

  it('deleteOne resolves when the memory is owned', async () => {
    const repo = { deleteForUser: vi.fn().mockResolvedValue(true) };
    const c = new MemoryController(repo as never, { get: () => 100 } as never);
    await expect(c.deleteOne(user, 'm1')).resolves.toBeUndefined();
    expect(repo.deleteForUser).toHaveBeenCalledWith('u1', 'm1');
  });

  it('deleteAll forgets all the caller memories and reports the count', async () => {
    const repo = { deleteAllForUser: vi.fn().mockResolvedValue(3) };
    const c = new MemoryController(repo as never, { get: () => 100 } as never);
    expect(await c.deleteAll(user)).toEqual({ deleted: 3 });
    expect(repo.deleteAllForUser).toHaveBeenCalledWith('u1');
  });
});
