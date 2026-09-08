import { randomBytes, randomUUID } from 'node:crypto';

import {
  test as base,
  expect,
  type Browser,
  type BrowserContext,
} from '@playwright/test';
import { hash } from 'bcryptjs';
import postgres from 'postgres';
import { z } from 'zod';

import { I18N_STORAGE_KEY } from '@knowtis/shared-util';

import { E2E } from '../../support/environment';

const accountSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  name: z.string(),
  avatarUrl: z.string().nullable(),
});
const loginSchema = z.object({
  user: accountSchema,
  tokens: z.object({ accessToken: z.string().min(1) }),
});
const noteSchema = z.object({
  id: z.uuid(),
  shareToken: z.string().nullable(),
});

async function createGuest(browser: Browser) {
  const context = await browser.newContext({
    baseURL: E2E.frontend,
    locale: 'en-US',
  });
  try {
    const response = await context.request.post(`${E2E.apiB}/auth/anonymous`, {
      data: {},
      headers: { Origin: E2E.frontend },
    });
    expect(response.status()).toBe(201);
    const session = z
      .object({
        user: z.object({
          id: z.uuid(),
          name: z.string(),
          isAnonymous: z.literal(true),
        }),
        accessToken: z.string().min(1),
      })
      .parse(await response.json());
    await context.addInitScript(
      ({ user, origin, localeKey }) => {
        if (
          location.origin !== origin ||
          localStorage.getItem('knowtis-auth')
        ) {
          return;
        }
        localStorage.setItem(
          'knowtis-auth',
          JSON.stringify({
            state: {
              user: { ...user, isAnonymous: true },
              isAuthenticated: true,
            },
            version: 0,
          })
        );
        localStorage.setItem(localeKey, 'en');
      },
      { user: session.user, origin: E2E.frontend, localeKey: I18N_STORAGE_KEY }
    );
    await useSecondApi(context);
    return {
      context,
      page: await context.newPage(),
      accessToken: session.accessToken,
    };
  } catch (error) {
    await context.close();
    throw error;
  }
}

async function createActor(browser: Browser, db: postgres.Sql, label: string) {
  const id = randomUUID();
  const email = `sharing-${id}@example.test`;
  const password = `${randomBytes(24).toString('base64url')}Aa1!`;
  const passwordHash = await hash(password, 10);
  await db`insert into users (id, email, name, password_hash, email_verified_at)
    values (${id}, ${email}, ${label}, ${passwordHash}, now())`;
  const context = await browser.newContext({
    baseURL: E2E.frontend,
    locale: 'en-US',
  });
  try {
    const response = await context.request.post(`${E2E.apiA}/auth/login`, {
      data: { email, password },
      headers: { Origin: E2E.frontend },
    });
    expect(response.status()).toBe(200);
    const session = loginSchema.parse(await response.json());
    expect(session.user.id).toBe(id);
    await context.addInitScript(
      ({ user, origin, localeKey }) => {
        if (
          location.origin !== origin ||
          localStorage.getItem('knowtis-auth')
        ) {
          return;
        }
        localStorage.setItem(
          'knowtis-auth',
          JSON.stringify({
            state: {
              user: { ...user, isAnonymous: false },
              isAuthenticated: true,
            },
            version: 0,
          })
        );
        localStorage.setItem(localeKey, 'en');
      },
      { user: session.user, origin: E2E.frontend, localeKey: I18N_STORAGE_KEY }
    );
    const page = await context.newPage();
    const sockets: string[] = [];
    page.on('websocket', (socket) => sockets.push(socket.url()));
    const headers = { Authorization: `Bearer ${session.tokens.accessToken}` };
    return {
      id,
      email,
      name: label,
      context,
      page,
      sockets,
      headers,
      accessToken: session.tokens.accessToken,
      async createNote(title: string) {
        const response = await context.request.post(`${E2E.apiA}/notes`, {
          headers,
          data: { title, content: '<p>Sharing acceptance</p>' },
        });
        expect(response.status()).toBe(201);
        return noteSchema.parse(await response.json());
      },
      async share(
        noteId: string,
        targetEmail: string,
        permission: 'viewer' | 'editor'
      ) {
        const response = await context.request.post(
          `${E2E.apiA}/notes/${noteId}/share`,
          {
            headers,
            data: { email: targetEmail, permission },
          }
        );
        expect(response.status()).toBe(201);
      },
      async update(noteId: string, data: Record<string, unknown>) {
        const response = await context.request.patch(
          `${E2E.apiA}/notes/${noteId}`,
          {
            headers,
            data,
          }
        );
        expect(response.status()).toBe(200);
        return noteSchema.parse(await response.json());
      },
    };
  } catch (error) {
    await context.close();
    throw error;
  }
}

/** Routes native collaboration sockets to the second real API without mocking frames. */
export async function useSecondApi(context: BrowserContext) {
  await context.addInitScript(() => {
    const NativeWebSocket = window.WebSocket;
    window.WebSocket = class extends NativeWebSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        const target = new URL(url);
        if (
          target.hostname === '127.0.0.1' &&
          target.port === '3373' &&
          target.pathname.startsWith('/collaboration')
        ) {
          target.port = '3374';
        }
        super(target, protocols);
      }
    };
  });
}

export type SharingActor = Awaited<ReturnType<typeof createActor>>;

export const test = base.extend<
  object,
  {
    sharing: {
      owner: SharingActor;
      recipient: SharingActor;
      editor: SharingActor;
      viewer: SharingActor;
      guest: Awaited<ReturnType<typeof createGuest>>;
    };
  }
>({
  sharing: [
    async ({ browser }, use) => {
      const db = postgres(E2E.database, { max: 1 });
      const actors: SharingActor[] = [];
      let guest: Awaited<ReturnType<typeof createGuest>> | undefined;
      try {
        await db`update feature_flags set enabled = true where key = 'email_verification_gate'`;
        for (const label of [
          'Owner',
          'Recipient',
          'Direct Editor',
          'Direct Viewer',
        ]) {
          actors.push(await createActor(browser, db, label));
        }
        const [owner, recipient, editor, viewer] = actors;
        if (!owner || !recipient || !editor || !viewer) {
          throw new Error('Sharing actors missing');
        }
        await useSecondApi(recipient.context);
        await useSecondApi(editor.context);
        await useSecondApi(viewer.context);
        guest = await createGuest(browser);
        await use({ owner, recipient, editor, viewer, guest });
      } finally {
        await guest?.context.close();
        await Promise.allSettled(actors.map(({ context }) => context.close()));
        await db.end({ timeout: 5 });
      }
    },
    { scope: 'worker' },
  ],
});
