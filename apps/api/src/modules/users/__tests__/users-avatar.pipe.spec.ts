import 'reflect-metadata';

import { JwtAuthGuard } from '@jovandyaz/auth-nestjs';
import type { ExecutionContext } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { I18nService, I18nValidationPipe } from 'nestjs-i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { STORED_IMAGE_HOST } from '@knowtis/shared-util';

import { UsersController } from '../users.controller';
import { UsersRepository } from '../users.repository';
import { UsersService } from '../users.service';

const USER_ID = 'user-1';
const STORED_AVATAR = `https://${STORED_IMAGE_HOST}/avatars/ana.png`;
const FOREIGN_AVATARS = [
  'https://evil.example/pixel.png',
  'https://attacker123.public.blob.vercel-storage.com/ana.png',
  `http://${STORED_IMAGE_HOST}/avatars/ana.png`,
  `https://${STORED_IMAGE_HOST}.evil.example/ana.png`,
  '/avatars/ana.png',
  'data:image/png;base64,iVBORw0KGgo=',
  '',
];

describe('an avatar sent to PATCH /users/profile through the pipe main.ts installs', () => {
  let app: NestExpressApplication;
  let baseUrl: string;
  const update = vi.fn();

  async function patchProfile(body: unknown) {
    const response = await fetch(`${baseUrl}/users/profile`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return response.status;
  }

  beforeEach(async () => {
    update.mockReset();
    update.mockImplementation((id: string, data: Record<string, unknown>) => ({
      id,
      email: 'ana@test.com',
      name: 'Ana',
      passwordHash: 'hash',
      ...data,
    }));
    const moduleRef = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        UsersService,
        { provide: UsersRepository, useValue: { update } },
        { provide: I18nService, useValue: { t: vi.fn() } },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest<{ user: unknown }>().user = {
            id: USER_ID,
          };
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

  it('stores an image from the app blob store', async () => {
    expect(await patchProfile({ avatarUrl: STORED_AVATAR })).toBe(200);
    expect(update).toHaveBeenCalledWith(USER_ID, { avatarUrl: STORED_AVATAR });
  });

  it.each(FOREIGN_AVATARS)('refuses %j', async (avatarUrl) => {
    expect(await patchProfile({ avatarUrl })).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it('clears the avatar with null', async () => {
    expect(await patchProfile({ avatarUrl: null })).toBe(200);
    expect(update).toHaveBeenCalledWith(USER_ID, { avatarUrl: null });
  });

  it('leaves the avatar alone when the body omits it', async () => {
    expect(await patchProfile({ name: 'Ana Lopez' })).toBe(200);
    expect(update).toHaveBeenCalledWith(USER_ID, { name: 'Ana Lopez' });
  });
});
