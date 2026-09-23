import 'reflect-metadata';

import { JwtAuthGuard } from '@jovandyaz/auth-nestjs';
import type { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { I18nValidationPipe } from 'nestjs-i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  ConversationSummary,
  ConversationTranscript,
} from '@knowtis/shared-types';

import { ConversationController } from './conversation.controller';
import { CONVERSATION_REPOSITORY } from './domain/ports/conversation.repository';

const USER_ID = '00000000-0000-4000-8000-0000000004c1';
const CONVERSATION_ID = '00000000-0000-4000-8000-0000000004c2';
const HISTORY_LIMIT = 120;
const NOT_A_UUID = 'not-a-uuid';

const SUMMARY: ConversationSummary = {
  id: CONVERSATION_ID,
  title: 'Trip',
  noteId: null,
  noteTitle: null,
  updatedAt: '2026-09-22T10:00:00.000Z',
};

const TRANSCRIPT: ConversationTranscript = {
  id: CONVERSATION_ID,
  title: 'Trip',
  noteId: null,
  hasEarlier: false,
  messages: [
    {
      turnId: null,
      role: 'user',
      content: 'Plan it',
      sources: [],
      stopReason: null,
    },
  ],
};

describe('ConversationController over HTTP', () => {
  let app: NestExpressApplication;
  let baseUrl: string;
  const repo = {
    listForUser: vi.fn(),
    loadTranscriptForUser: vi.fn(),
    rename: vi.fn(),
    deleteForUser: vi.fn(),
  };

  async function call(method: string, path: string, body?: unknown) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    return {
      status: response.status,
      body: text ? (JSON.parse(text) as unknown) : undefined,
    };
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [ConversationController],
      providers: [
        { provide: CONVERSATION_REPOSITORY, useValue: repo },
        { provide: ConfigService, useValue: { get: () => HISTORY_LIMIT } },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest<{ user?: { id: string } }>().user =
            { id: USER_ID };
          return true;
        },
      })
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.useGlobalPipes(
      new I18nValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      })
    );
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  afterEach(async () => {
    await app.close();
  });

  it('lists the first page of the caller conversations in the pagination envelope', async () => {
    repo.listForUser.mockResolvedValue({ items: [SUMMARY], total: 1 });

    const response = await call('GET', '/agent/conversations');

    expect(response).toEqual({
      status: 200,
      body: { items: [SUMMARY], total: 1, page: 1, limit: 25 },
    });
    expect(repo.listForUser).toHaveBeenCalledWith(USER_ID, {
      offset: 0,
      limit: 25,
    });
  });

  it('turns page and limit into an offset', async () => {
    repo.listForUser.mockResolvedValue({ items: [], total: 0 });

    const response = await call('GET', '/agent/conversations?page=3&limit=10');

    expect(response.body).toEqual({ items: [], total: 0, page: 3, limit: 10 });
    expect(repo.listForUser).toHaveBeenCalledWith(USER_ID, {
      offset: 20,
      limit: 10,
    });
  });

  it('refuses a page size past the shared ceiling', async () => {
    expect((await call('GET', '/agent/conversations?limit=101')).status).toBe(
      400
    );
    expect(repo.listForUser).not.toHaveBeenCalled();
  });

  it('returns the transcript the repository read for the caller', async () => {
    repo.loadTranscriptForUser.mockResolvedValue(TRANSCRIPT);

    const response = await call(
      'GET',
      `/agent/conversations/${CONVERSATION_ID}/messages`
    );

    expect(response).toEqual({ status: 200, body: TRANSCRIPT });
    expect(repo.loadTranscriptForUser).toHaveBeenCalledWith(
      CONVERSATION_ID,
      USER_ID,
      HISTORY_LIMIT
    );
  });

  it('answers 404 for a conversation that is missing or not the caller', async () => {
    repo.loadTranscriptForUser.mockResolvedValue(null);
    repo.rename.mockResolvedValue(false);
    repo.deleteForUser.mockResolvedValue(false);

    expect([
      (await call('GET', `/agent/conversations/${CONVERSATION_ID}/messages`))
        .status,
      (
        await call('PATCH', `/agent/conversations/${CONVERSATION_ID}`, {
          title: 'x',
        })
      ).status,
      (await call('DELETE', `/agent/conversations/${CONVERSATION_ID}`)).status,
    ]).toEqual([404, 404, 404]);
  });

  it('answers 400 for an id that is not a UUID and never reaches the repository', async () => {
    expect([
      (await call('GET', `/agent/conversations/${NOT_A_UUID}/messages`)).status,
      (
        await call('PATCH', `/agent/conversations/${NOT_A_UUID}`, {
          title: 'x',
        })
      ).status,
      (await call('DELETE', `/agent/conversations/${NOT_A_UUID}`)).status,
    ]).toEqual([400, 400, 400]);
    expect(repo.loadTranscriptForUser).not.toHaveBeenCalled();
    expect(repo.rename).not.toHaveBeenCalled();
    expect(repo.deleteForUser).not.toHaveBeenCalled();
  });

  it('renames with the normalized title', async () => {
    repo.rename.mockResolvedValue(true);

    const response = await call(
      'PATCH',
      `/agent/conversations/${CONVERSATION_ID}`,
      { title: '  Trip \n to   Oaxaca ' }
    );

    expect(response.status).toBe(204);
    expect(repo.rename).toHaveBeenCalledWith(
      CONVERSATION_ID,
      USER_ID,
      'Trip to Oaxaca'
    );
  });

  it.each([
    ['whitespace only', '   \n '],
    ['past the limit', 'x'.repeat(121)],
    ['past the limit once each emoji selector counts', '❤️'.repeat(61)],
  ])('refuses a title that is %s', async (_label, title) => {
    const response = await call(
      'PATCH',
      `/agent/conversations/${CONVERSATION_ID}`,
      { title }
    );

    expect(response.status).toBe(400);
    expect(repo.rename).not.toHaveBeenCalled();
  });

  it.each([123, true])(
    'refuses the non-string title %j the implicit conversion would stringify',
    async (title) => {
      const response = await call(
        'PATCH',
        `/agent/conversations/${CONVERSATION_ID}`,
        { title }
      );

      expect(response.status).toBe(400);
      expect(repo.rename).not.toHaveBeenCalled();
    }
  );

  it('accepts a title of exactly 120 code points, emoji included', async () => {
    repo.rename.mockResolvedValue(true);

    const response = await call(
      'PATCH',
      `/agent/conversations/${CONVERSATION_ID}`,
      { title: '🙂'.repeat(120) }
    );

    expect(response.status).toBe(204);
  });

  it('refuses fields the rename does not take', async () => {
    const response = await call(
      'PATCH',
      `/agent/conversations/${CONVERSATION_ID}`,
      { title: 'ok', userId: 'someone-else' }
    );

    expect(response.status).toBe(400);
  });

  it('deletes the caller conversation', async () => {
    repo.deleteForUser.mockResolvedValue(true);

    const response = await call(
      'DELETE',
      `/agent/conversations/${CONVERSATION_ID}`
    );

    expect(response).toEqual({ status: 204, body: undefined });
    expect(repo.deleteForUser).toHaveBeenCalledWith(CONVERSATION_ID, USER_ID);
  });
});
