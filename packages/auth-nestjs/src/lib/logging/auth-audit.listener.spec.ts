import {
  AuthEventName,
  EMAIL_VERIFICATION_SOURCE,
  EmailVerifiedEvent,
} from '@jovandyaz/auth/server';
import { Logger } from '@nestjs/common';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AuthAuditListener } from './auth-audit.listener';

const USER_ID = '00000000-0000-4000-8000-0000000000f1';

describe('AuthAuditListener', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(Object.values(EMAIL_VERIFICATION_SOURCE))(
    'audits an email verification announced by a %s handler',
    async (source) => {
      const logSpy = vi
        .spyOn(Logger.prototype, 'log')
        .mockImplementation(() => undefined);
      const moduleRef = await Test.createTestingModule({
        imports: [EventEmitterModule.forRoot()],
        providers: [AuthAuditListener],
      }).compile();
      await moduleRef.init();

      moduleRef
        .get(EventEmitter2)
        .emit(
          AuthEventName.EMAIL_VERIFIED,
          new EmailVerifiedEvent(USER_ID, source, new Date())
        );

      expect(logSpy).toHaveBeenCalledWith(
        `Email verified: userId=${USER_ID} source=${source}`
      );

      await moduleRef.close();
    }
  );
});
