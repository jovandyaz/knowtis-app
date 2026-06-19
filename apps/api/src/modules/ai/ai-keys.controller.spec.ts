import { ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AiKeysController } from './ai-keys.controller';

function make(flagOn = true) {
  const byok = {
    listKeys: vi.fn().mockResolvedValue([]),
    setKey: vi.fn().mockResolvedValue(undefined),
    deleteKey: vi.fn().mockResolvedValue(undefined),
  };
  const flags = { isEnabled: vi.fn().mockResolvedValue(flagOn) };
  return {
    controller: new AiKeysController(byok as never, flags as never),
    byok,
  };
}

const user = { id: 'u1', isAnonymous: false } as never;

describe('AiKeysController', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists keys for the user', async () => {
    const { controller, byok } = make();
    await controller.list(user);
    expect(byok.listKeys).toHaveBeenCalledWith('u1');
  });

  it('sets a key then returns the masked list', async () => {
    const { controller, byok } = make();
    byok.listKeys.mockResolvedValueOnce([
      { provider: 'anthropic', keyPrefix: 'sk-ant-' },
    ]);

    const result = await controller.set(
      user,
      { provider: 'anthropic' } as never,
      {
        apiKey: 'sk-ant-1234',
      } as never
    );

    expect(byok.setKey).toHaveBeenCalledWith('u1', 'anthropic', 'sk-ant-1234');
    expect(result).toEqual([{ provider: 'anthropic', keyPrefix: 'sk-ant-' }]);
  });

  it('forbids when the flag is off', async () => {
    const { controller } = make(false);
    await expect(controller.list(user)).rejects.toBeInstanceOf(
      ForbiddenException
    );
  });

  it('forbids setting a key when the flag is off', async () => {
    const { controller, byok } = make(false);
    await expect(
      controller.set(
        user,
        { provider: 'anthropic' } as never,
        { apiKey: 'sk-ant-1234' } as never
      )
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(byok.setKey).not.toHaveBeenCalled();
  });

  it('forbids anonymous users from setting a key', async () => {
    const { controller, byok } = make(true);
    await expect(
      controller.set(
        { id: 'a1', isAnonymous: true } as never,
        { provider: 'anthropic' } as never,
        { apiKey: 'sk-ant-1234' } as never
      )
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(byok.setKey).not.toHaveBeenCalled();
  });

  it('forbids anonymous users', async () => {
    const { controller } = make(true);
    await expect(
      controller.list({ id: 'a1', isAnonymous: true } as never)
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('deletes a key for the user', async () => {
    const { controller, byok } = make();
    await controller.remove(user, { provider: 'openai' } as never);
    expect(byok.deleteKey).toHaveBeenCalledWith('u1', 'openai');
  });

  it('forbids anonymous users from deleting a key', async () => {
    const { controller } = make(true);
    await expect(
      controller.remove(
        { id: 'a1', isAnonymous: true } as never,
        { provider: 'openai' } as never
      )
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
