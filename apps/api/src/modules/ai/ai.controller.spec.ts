import { JwtAuthGuard } from '@jovandyaz/auth-nestjs';
import type { RequestUser } from '@jovandyaz/auth/server';
import {
  BadRequestException,
  ForbiddenException,
  type ExecutionContext,
  type INestApplication,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
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

import { RolesGuard } from '../authorization/roles.guard';
import { FeatureFlagGuard } from '../feature-flags/feature-flag.guard';
import { AIController, MAX_VOICE_NOTE_BYTES } from './ai.controller';
import { CompleteTextHandler } from './application/commands/complete-text.handler';
import { VoiceNoteHandler } from './application/commands/voice-note.handler';
import {
  AIConfigService,
  InvalidAIConfigError,
} from './application/services/ai-config.service';
import { AI_USAGE_REPOSITORY } from './domain/ports/ai-usage.repository';
import { FallbackChainService } from './infrastructure/providers/fallback-chain.service';

function createContext(role: string | undefined, handler: object) {
  return {
    getHandler: () => handler,
    getClass: () => AIController,
    switchToHttp: () => ({
      getRequest: () => ({ user: role ? { id: 'u1', role } : { id: 'u1' } }),
    }),
  } as unknown as ExecutionContext;
}

describe('AIController config role gating', () => {
  const guard = new RolesGuard(new Reflector());

  it.each([
    ['getConfig', AIController.prototype.getConfig],
    ['setConfig', AIController.prototype.setConfig],
    ['resetConfig', AIController.prototype.resetConfig],
  ])('applies RolesGuard to %s', (_name, handler) => {
    const guards: unknown[] = Reflect.getMetadata('__guards__', handler) ?? [];

    expect(guards).toContain(RolesGuard);
  });

  it('rejects a non-admin user reading the AI config', () => {
    expect(() =>
      guard.canActivate(createContext('user', AIController.prototype.getConfig))
    ).toThrow(ForbiddenException);
  });

  it('rejects a user without role reading the AI config', () => {
    expect(() =>
      guard.canActivate(
        createContext(undefined, AIController.prototype.getConfig)
      )
    ).toThrow(ForbiddenException);
  });

  it('allows an admin to read the AI config', () => {
    expect(
      guard.canActivate(
        createContext('admin', AIController.prototype.getConfig)
      )
    ).toBe(true);
  });
});

describe('AIController resetConfig', () => {
  it('returns the effective config list after a reset', async () => {
    const effective = [
      {
        key: 'ai_default_model',
        value: 'openrouter:minimax/minimax-m2.5',
        kind: 'model',
        source: 'default',
        storedValue: null,
        description: null,
        updatedAt: null,
      },
    ];
    const aiConfigService = {
      resetConfig: vi.fn().mockResolvedValue(undefined),
      getEffectiveConfig: vi.fn().mockResolvedValue(effective),
    };
    const controller = new AIController(
      {} as never,
      {} as never,
      aiConfigService as never,
      {} as never,
      {} as never
    );

    const result = await controller.resetConfig(
      { id: 'u1' } as RequestUser,
      'ai_default_model'
    );

    expect(aiConfigService.resetConfig).toHaveBeenCalledWith(
      'ai_default_model',
      'u1'
    );
    expect(result).toBe(effective);
  });

  it('maps an unknown key to a 400 without resolving the effective config', async () => {
    const aiConfigService = {
      resetConfig: vi
        .fn()
        .mockRejectedValue(
          new InvalidAIConfigError("Unknown AI config key: 'ai_bogus_key'")
        ),
      getEffectiveConfig: vi.fn(),
    };
    const controller = new AIController(
      {} as never,
      {} as never,
      aiConfigService as never,
      {} as never,
      {} as never
    );

    await expect(
      controller.resetConfig({ id: 'u1' } as RequestUser, 'ai_bogus_key')
    ).rejects.toThrow(BadRequestException);
    expect(aiConfigService.getEffectiveConfig).not.toHaveBeenCalled();
  });
});

describe('POST /ai/voice-note', () => {
  let app: INestApplication;
  let base: string;
  const execute = vi.fn();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AIController],
      providers: [
        { provide: CompleteTextHandler, useValue: {} },
        { provide: VoiceNoteHandler, useValue: { execute } },
        { provide: AIConfigService, useValue: {} },
        { provide: FallbackChainService, useValue: {} },
        { provide: AI_USAGE_REPOSITORY, useValue: {} },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          ctx.switchToHttp().getRequest().user = { id: 'u1', role: 'user' };
          return true;
        },
      })
      .overrideGuard(FeatureFlagGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    await app.listen(0);
    base = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    execute.mockReset();
  });

  function postRecording(bytes: number) {
    const form = new FormData();
    form.append('mode', 'create-note');
    form.append(
      'audio',
      new Blob([new Uint8Array(bytes)], { type: 'audio/webm' }),
      'note.webm'
    );
    return fetch(`${base}/ai/voice-note`, { method: 'POST', body: form });
  }

  it('hands a recording of exactly MAX_VOICE_NOTE_BYTES to the handler', async () => {
    execute.mockResolvedValue(
      ok({ title: 'Note', content: '<p>Hi</p>', transcript: 'Hi' })
    );

    const response = await postRecording(MAX_VOICE_NOTE_BYTES);

    expect(response.ok).toBe(true);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls[0]?.[0].audio.length).toBe(MAX_VOICE_NOTE_BYTES);
  });

  it('refuses a recording over MAX_VOICE_NOTE_BYTES with 413 before the handler runs', async () => {
    const response = await postRecording(MAX_VOICE_NOTE_BYTES + 1);

    expect(response.status).toBe(413);
    expect(execute).not.toHaveBeenCalled();
  });
});
