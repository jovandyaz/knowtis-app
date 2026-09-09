import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

import {
  AuthNestjsModule,
  JWT_AUDIENCE_ACCESS,
  JWT_ISSUER,
} from '@jovandyaz/auth-nestjs';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { eq } from 'drizzle-orm';
import { AcceptLanguageResolver, I18nModule } from 'nestjs-i18n';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { FEATURE_FLAG_KEYS } from '@knowtis/shared-types';

import { DatabaseModule } from '../../../database/database.module';
import { featureFlags } from '../../../database/schema/feature-flags.schema';
import { notePermissions, notes } from '../../../database/schema/notes.schema';
import { sessions } from '../../../database/schema/sessions.schema';
import { users } from '../../../database/schema/users.schema';
import { DB_AVAILABLE } from '../../../test-support/database';
import { DrizzleEmailVerificationTokenRepository } from '../../auth/infrastructure/persistence/drizzle-email-verification-token.repository';
import { DrizzlePasswordResetTokenRepository } from '../../auth/infrastructure/persistence/drizzle-password-reset-token.repository';
import { DrizzleSessionRepository } from '../../auth/infrastructure/persistence/drizzle-session.repository';
import { DrizzleUserRepository } from '../../auth/infrastructure/persistence/drizzle-user.repository';
import { BcryptPasswordHasher } from '../../auth/infrastructure/security/bcrypt-password-hasher';
import { JwtTokenService } from '../../auth/infrastructure/security/jwt-token.service';
import { AuthorizationModule } from '../../authorization/authorization.module';
import { UsersModule } from '../../users/users.module';
import { NotesModule } from '../notes.module';
import { createSharingFixture, type SharingFixture } from './sharing.fixture';

class UnusedEmailTransport {
  async sendEmailVerification(): Promise<never> {
    throw new Error('This contract must not send email');
  }
  async sendPasswordReset(): Promise<never> {
    throw new Error('This contract must not send email');
  }
}

describe.runIf(DB_AVAILABLE)(
  'People real Nest HTTP + PostgreSQL contract',
  () => {
    let f: SharingFixture;
    let app: INestApplication;
    let base: string;
    const tokens = new Map<string, string>();
    let flagChanged = false;
    let previousFlag: typeof featureFlags.$inferSelect | undefined;
    beforeAll(async () => {
      f = await createSharingFixture();
      const secret = 's1-http-contract-local-secret-32-characters';
      const moduleRef = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
          DatabaseModule,
          EventEmitterModule.forRoot(),
          I18nModule.forRoot({
            fallbackLanguage: 'en',
            loaderOptions: {
              path: join(__dirname, '../../../i18n/'),
              watch: false,
            },
            resolvers: [AcceptLanguageResolver],
          }),
          AuthorizationModule,
          NotesModule,
          AuthNestjsModule.register({
            imports: [UsersModule],
            tokenConfig: {
              accessTokenSecret: secret,
              refreshTokenSecret: secret,
            },
            tokenHashKey: Buffer.alloc(32, 9).toString('base64'),
            userRepository: DrizzleUserRepository,
            sessionRepository: DrizzleSessionRepository,
            tokenService: JwtTokenService,
            passwordHasher: BcryptPasswordHasher,
            emailService: UnusedEmailTransport,
            emailVerificationTokenRepository:
              DrizzleEmailVerificationTokenRepository,
            passwordResetTokenRepository: DrizzlePasswordResetTokenRepository,
          }),
        ],
      }).compile();
      app = moduleRef.createNestApplication({ logger: false });
      app.useGlobalPipes(
        new ValidationPipe({
          whitelist: true,
          forbidNonWhitelisted: true,
          transform: true,
        })
      );
      app.setGlobalPrefix('api/v1');
      await app.listen(0, '127.0.0.1');
      base = await app.getUrl();
      [previousFlag] = await f.db
        .select()
        .from(featureFlags)
        .where(eq(featureFlags.key, FEATURE_FLAG_KEYS.EMAIL_VERIFICATION_GATE));
      await f.db
        .insert(featureFlags)
        .values({
          key: FEATURE_FLAG_KEYS.EMAIL_VERIFICATION_GATE,
          enabled: true,
        })
        .onConflictDoUpdate({
          target: featureFlags.key,
          set: { enabled: true },
        });
      flagChanged = true;
      const jwt = new JwtService({ secret });
      for (const id of [
        f.ids.owner,
        f.ids.editor,
        f.ids.viewer,
        f.ids.target,
        f.ids.stranger,
      ]) {
        const familyId = randomUUID();
        await f.db.insert(sessions).values({
          userId: id,
          familyId,
          refreshTokenHash: randomUUID(),
          expiresAt: new Date(Date.now() + 60_000),
        });
        tokens.set(
          id,
          jwt.sign(
            { sub: id, email: f.email(id), familyId },
            {
              algorithm: 'HS256',
              issuer: JWT_ISSUER,
              audience: JWT_AUDIENCE_ACCESS,
              expiresIn: '1m',
            }
          )
        );
      }
    }, 30_000);
    afterAll(async () => {
      try {
        await app?.close();
        if (f && flagChanged) {
          if (previousFlag) {
            await f.db
              .update(featureFlags)
              .set(previousFlag)
              .where(
                eq(featureFlags.key, FEATURE_FLAG_KEYS.EMAIL_VERIFICATION_GATE)
              );
          } else {
            await f.db
              .delete(featureFlags)
              .where(
                eq(featureFlags.key, FEATURE_FLAG_KEYS.EMAIL_VERIFICATION_GATE)
              );
          }
        }
      } finally {
        await f?.close();
      }
    });
    beforeEach(async () => {
      await f.db
        .update(users)
        .set({ emailVerifiedAt: new Date() })
        .where(eq(users.id, f.ids.owner));
      await f.db
        .update(users)
        .set({ role: 'user' })
        .where(eq(users.id, f.ids.stranger));
      await f.db
        .update(notes)
        .set({
          generalAccess: 'anyone_with_link',
          generalAccessPermission: 'editor',
          editorsCanShare: true,
          shareToken: `s1-${f.ids.note}`,
        })
        .where(eq(notes.id, f.ids.note));
      await f.db
        .delete(notePermissions)
        .where(eq(notePermissions.noteId, f.ids.note));
      await f.db.insert(notePermissions).values([
        { noteId: f.ids.note, userId: f.ids.editor, permission: 'editor' },
        { noteId: f.ids.note, userId: f.ids.viewer, permission: 'viewer' },
      ]);
    });
    const request = (
      method: string,
      suffix: string,
      actor?: string,
      body?: unknown
    ) =>
      fetch(`${base}/api/v1/notes/${f.ids.note}${suffix}`, {
        method,
        headers: {
          ...(actor ? { Authorization: `Bearer ${tokens.get(actor)}` } : {}),
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    it('rotates through HTTP for an unverified owner while paused, returning only a note view', async () => {
      await f.db
        .update(users)
        .set({ emailVerifiedAt: null })
        .where(eq(users.id, f.ids.owner));
      await f.db
        .update(notes)
        .set({ generalAccess: 'restricted', shareToken: 'rotation-before' })
        .where(eq(notes.id, f.ids.note));
      const response = await request('POST', '/share-link/rotate', f.ids.owner);
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.shareToken).toMatch(/^[a-f0-9]{32}$/);
      expect(body.generalAccess).toBe('restricted');
      expect(body.content).toBe('<p>Existing note content</p>');
      expect(body).not.toHaveProperty('yjsState');
      const [persisted] = await f.db
        .select()
        .from(notes)
        .where(eq(notes.id, f.ids.note));
      expect(persisted?.shareToken).toBe(body.shareToken);
    });
    it('denies rotation to editors, viewers, strangers and administrators', async () => {
      for (const actor of [f.ids.editor, f.ids.viewer, f.ids.stranger]) {
        expect(
          (await request('POST', '/share-link/rotate', actor)).status
        ).toBe(403);
      }
      await f.db
        .update(users)
        .set({ role: 'admin' })
        .where(eq(users.id, f.ids.stranger));
      expect(
        (await request('POST', '/share-link/rotate', f.ids.stranger)).status
      ).toBe(403);
      expect((await request('POST', '/share-link/rotate')).status).toBe(401);
    });
    it('rejects missing tokens with 409 and non-empty rotation bodies with 400', async () => {
      await f.db
        .update(notes)
        .set({ shareToken: null })
        .where(eq(notes.id, f.ids.note));
      expect(
        (await request('POST', '/share-link/rotate', f.ids.owner)).status
      ).toBe(409);
      expect(
        (
          await request('POST', '/share-link/rotate', f.ids.owner, {
            shareToken: 'supplied',
          })
        ).status
      ).toBe(400);
    });
    it('lets exactly one concurrent HTTP rotation win and rejects the old public URL while preserving direct access', async () => {
      const locked = Promise.withResolvers<undefined>();
      const release = Promise.withResolvers<undefined>();
      const hold = f.client.begin(async (tx) => {
        await tx`select id from notes where id = ${f.ids.note} for update`;
        locked.resolve(undefined);
        await release.promise;
      });
      await locked.promise;
      const attempts = [
        request('POST', '/share-link/rotate', f.ids.owner),
        request('POST', '/share-link/rotate', f.ids.owner),
      ];
      try {
        await vi.waitFor(
          async () => {
            const [count] =
              await f.client`select count(*)::int as count from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock' and query ilike '%update%notes%'`;
            expect(count?.['count']).toBeGreaterThanOrEqual(2);
          },
          { timeout: 5000, interval: 20 }
        );
      } finally {
        release.resolve(undefined);
        await hold;
      }
      const responses = await Promise.all(attempts);
      expect(responses.map((response) => response.status).sort()).toEqual([
        200, 409,
      ]);
      const changed = await responses
        .find((response) => response.status === 200)
        ?.json();
      const previous = `s1-${f.ids.note}`;
      expect(
        (await fetch(`${base}/api/v1/notes/shared/${previous}`)).status
      ).toBe(404);
      expect(
        (await fetch(`${base}/api/v1/notes/shared/${changed.shareToken}`))
          .status
      ).toBe(200);
      expect((await request('GET', '', f.ids.viewer)).status).toBe(200);
      const [persisted] = await f.db
        .select()
        .from(notes)
        .where(eq(notes.id, f.ids.note));
      expect(persisted?.shareToken).toBe(changed.shareToken);
    });
    it('requires actual valid JWT/session authentication', async () => {
      expect((await request('GET', '/collaborators')).status).toBe(401);
    });
    it('rejects legacy UUID bodies through the real ValidationPipe', async () => {
      const response = await request('POST', '/share', f.ids.owner, {
        userId: f.ids.target,
        permission: 'viewer',
      });
      expect(response.status).toBe(400);
    });
    it('accepts padded uppercase email and returns 201 with the canonical person', async () => {
      const response = await request('POST', '/share', f.ids.owner, {
        email: `  ${f.email(f.ids.target).toUpperCase()}  `,
        permission: 'viewer',
      });
      expect(response.status).toBe(201);
      expect(await response.json()).toEqual({
        user: {
          id: f.ids.target,
          name: 'Same Name',
          email: f.email(f.ids.target),
          avatarUrl: null,
        },
        permission: 'viewer',
      });
      const people = await (
        await request('GET', '/collaborators', f.ids.owner)
      ).json();
      expect(people[0].permission).toBe('owner');
      expect(people.map((p: { user: { id: string } }) => p.user.id)).toContain(
        f.ids.target
      );
    });
    it.each(['stranger', 'viewer'] as const)(
      'denies %s list and mutation without leaking recipient existence',
      async (key) => {
        expect(
          (await request('GET', '/collaborators', f.ids[key])).status
        ).toBe(403);
        const known = await request('POST', '/share', f.ids[key], {
          email: f.email(f.ids.target),
          permission: 'viewer',
        });
        const unknown = await request('POST', '/share', f.ids[key], {
          email: 'absent@example.test',
          permission: 'viewer',
        });
        expect(known.status).toBe(403);
        expect(unknown.status).toBe(403);
        expect(await known.json()).toEqual(await unknown.json());
      }
    );
    it('allows a direct editor to list, add and revoke when enabled', async () => {
      expect(
        (await request('GET', '/collaborators', f.ids.editor)).status
      ).toBe(200);
      expect(
        (
          await request('POST', '/share', f.ids.editor, {
            email: f.email(f.ids.target),
            permission: 'editor',
          })
        ).status
      ).toBe(201);
      const response = await request(
        'DELETE',
        `/share/${f.ids.target}`,
        f.ids.editor
      );
      expect(response.status).toBe(204);
      expect(await response.text()).toBe('');
      expect(
        (await request('GET', '/collaborators', f.ids.target)).status
      ).toBe(403);
    });
    it('denies direct editor management when the owner disables sharing', async () => {
      await f.db
        .update(notes)
        .set({ editorsCanShare: false })
        .where(eq(notes.id, f.ids.note));
      expect(
        (await request('GET', '/collaborators', f.ids.editor)).status
      ).toBe(403);
      expect(
        (await request('DELETE', `/share/${f.ids.viewer}`, f.ids.editor)).status
      ).toBe(403);
    });
    it('uses generic 422 for owner, self, anonymous and unknown recipient', async () => {
      const responses = [];
      for (const email of [
        f.email(f.ids.owner),
        f.email(f.ids.anonymous),
        'absent@example.test',
      ]) {
        const response = await request('POST', '/share', f.ids.owner, {
          email,
          permission: 'viewer',
        });
        expect(response.status).toBe(422);
        responses.push(await response.json());
      }
      expect(
        responses.every((body) => body.code === 'PERSON_NOT_ADDABLE')
      ).toBe(true);
      expect(responses[0]).toEqual(responses[1]);
      expect(responses[1]).toEqual(responses[2]);
      expect(
        (await request('DELETE', `/share/${f.ids.owner}`, f.ids.editor)).status
      ).toBe(422);
      expect(
        (await request('DELETE', `/share/${f.ids.editor}`, f.ids.editor)).status
      ).toBe(422);
    });
    it('lets an unverified owner list, narrow, revoke and restrict, but not add or escalate', async () => {
      await f.db
        .update(users)
        .set({ emailVerifiedAt: null })
        .where(eq(users.id, f.ids.owner));
      expect((await request('GET', '/collaborators', f.ids.owner)).status).toBe(
        200
      );
      expect(
        (
          await request('POST', '/share', f.ids.owner, {
            email: f.email(f.ids.editor),
            permission: 'viewer',
          })
        ).status
      ).toBe(201);
      expect(
        (
          await request('POST', '/share', f.ids.owner, {
            email: f.email(f.ids.viewer),
            permission: 'editor',
          })
        ).status
      ).toBe(403);
      expect(
        (
          await request('POST', '/share', f.ids.owner, {
            email: f.email(f.ids.target),
            permission: 'viewer',
          })
        ).status
      ).toBe(403);
      expect(
        (await request('DELETE', `/share/${f.ids.viewer}`, f.ids.owner)).status
      ).toBe(204);
      expect(
        (
          await request('PATCH', '', f.ids.owner, {
            generalAccess: 'restricted',
          })
        ).status
      ).toBe(200);
      expect(
        (
          await request('PATCH', '', f.ids.owner, {
            generalAccess: 'anyone_with_link',
          })
        ).status
      ).toBe(403);
    });
    it('does not grant People administration to an administrator without direct note rights', async () => {
      await f.db
        .update(users)
        .set({ role: 'admin' })
        .where(eq(users.id, f.ids.stranger));
      expect(
        (await request('GET', '/collaborators', f.ids.stranger)).status
      ).toBe(403);
      expect(
        (
          await request('POST', '/share', f.ids.stranger, {
            email: f.email(f.ids.target),
            permission: 'viewer',
          })
        ).status
      ).toBe(403);
    });
    it('preserves content and CRDT state when changing People', async () => {
      const [before] = await f.db
        .select({ content: notes.content, yjsState: notes.yjsState })
        .from(notes)
        .where(eq(notes.id, f.ids.note));
      expect(
        (
          await request('POST', '/share', f.ids.owner, {
            email: f.email(f.ids.target),
            permission: 'viewer',
          })
        ).status
      ).toBe(201);
      expect(
        (await request('DELETE', `/share/${f.ids.target}`, f.ids.owner)).status
      ).toBe(204);
      const [after] = await f.db
        .select({ content: notes.content, yjsState: notes.yjsState })
        .from(notes)
        .where(eq(notes.id, f.ids.note));
      expect(after).toEqual(before);
    });
    it('rejects an otherwise valid JWT after its real session is revoked', async () => {
      await f.db.delete(sessions).where(eq(sessions.userId, f.ids.target));
      expect(
        (await request('GET', '/collaborators', f.ids.target)).status
      ).toBe(401);
    });
  }
);
