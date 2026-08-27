import { renderEmail } from '@jovandyaz/email';
import { err, ok } from 'neverthrow';

import { EMAIL_ERROR_SEND_FAILED } from '../constants';
import { EmailSendError, type EmailSender } from '../ports/email-sender.port';
import { AuthEmailService } from './auth-email.service';

vi.mock('@jovandyaz/email', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@jovandyaz/email')>();
  return {
    ...actual,
    renderEmail: vi.fn((_template: string, props: Record<string, unknown>) => {
      return Promise.resolve(
        `<html><body>${props['name'] as string} ${(props['verificationUrl'] as string) ?? (props['resetUrl'] as string) ?? ''} ${(props['code'] as string) ?? ''}</body></html>`
      );
    }),
  };
});

const VERIFICATION_PAYLOAD = { token: 'abc123', code: '482913' };

describe('AuthEmailService', () => {
  let mockSender: EmailSender;
  let service: AuthEmailService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSender = {
      send: vi.fn().mockResolvedValue(ok(undefined)),
    };
    service = new AuthEmailService(
      mockSender,
      { from: 'Knowtis <noreply@knowtis.com>' },
      'https://knowtis.app'
    );
  });

  describe('sendEmailVerification', () => {
    it('renders template and sends email', async () => {
      const result = await service.sendEmailVerification(
        'user@test.com',
        VERIFICATION_PAYLOAD,
        'John'
      );

      expect(result.isOk()).toBe(true);
      expect(mockSender.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@test.com',
          subject: expect.stringContaining('Verify'),
          html: expect.stringContaining('John'),
          from: 'Knowtis <noreply@knowtis.com>',
        })
      );
    });

    it('builds correct verification URL', async () => {
      await service.sendEmailVerification(
        'user@test.com',
        { token: 'token123', code: '482913' },
        'Jane'
      );

      expect(mockSender.send).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining(
            'https://knowtis.app/verify-email?token=token123'
          ),
        })
      );
    });

    it('hands the one-time code to the template', async () => {
      await service.sendEmailVerification(
        'user@test.com',
        VERIFICATION_PAYLOAD,
        'Jane'
      );

      expect(renderEmail).toHaveBeenCalledWith(
        'verify-email',
        expect.objectContaining({ code: '482913' })
      );
    });

    it('keeps the code out of the subject line', async () => {
      await service.sendEmailVerification(
        'user@test.com',
        VERIFICATION_PAYLOAD,
        'Jane'
      );

      expect(mockSender.send).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: expect.not.stringContaining(VERIFICATION_PAYLOAD.code),
        })
      );
    });

    it('renders in the requested locale', async () => {
      await service.sendEmailVerification(
        'user@test.com',
        VERIFICATION_PAYLOAD,
        'Jane',
        'es'
      );

      expect(renderEmail).toHaveBeenCalledWith(
        'verify-email',
        expect.objectContaining({ locale: 'es' })
      );
    });

    it('writes the subject in that locale too, not only the body', async () => {
      await service.sendEmailVerification(
        'user@test.com',
        VERIFICATION_PAYLOAD,
        'Jane',
        'es'
      );

      expect(mockSender.send).toHaveBeenCalledWith(
        expect.objectContaining({ subject: 'Verifica tu email — Knowtis' })
      );
    });

    it('falls back to the default locale when none is given', async () => {
      await service.sendEmailVerification(
        'user@test.com',
        VERIFICATION_PAYLOAD,
        'Jane'
      );

      expect(renderEmail).toHaveBeenCalledWith(
        'verify-email',
        expect.objectContaining({ locale: 'en' })
      );
    });

    it('falls back to the default locale when the stored one is unsupported', async () => {
      await service.sendEmailVerification(
        'user@test.com',
        VERIFICATION_PAYLOAD,
        'Jane',
        'klingon'
      );

      expect(renderEmail).toHaveBeenCalledWith(
        'verify-email',
        expect.objectContaining({ locale: 'en' })
      );
    });

    it('returns error when sender fails', async () => {
      vi.mocked(mockSender.send).mockResolvedValue(
        err(new EmailSendError('Send failed'))
      );

      const result = await service.sendEmailVerification(
        'user@test.com',
        VERIFICATION_PAYLOAD,
        'John'
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe(EMAIL_ERROR_SEND_FAILED);
      }
    });
  });

  describe('sendPasswordReset', () => {
    it('renders template and sends email', async () => {
      const result = await service.sendPasswordReset(
        'user@test.com',
        'xyz789',
        'Jane'
      );

      expect(result.isOk()).toBe(true);
      expect(mockSender.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@test.com',
          subject: expect.stringContaining('Reset'),
          html: expect.stringContaining('Jane'),
        })
      );
    });

    it('builds correct reset URL', async () => {
      await service.sendPasswordReset('user@test.com', 'token456', 'Jane');

      expect(mockSender.send).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining(
            'https://knowtis.app/reset-password?token=token456'
          ),
        })
      );
    });

    it('writes the subject in that locale too, not only the body', async () => {
      await service.sendPasswordReset(
        'user@test.com',
        'reset-token',
        'Jane',
        'es'
      );

      expect(mockSender.send).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: 'Restablece tu contraseña — Knowtis',
        })
      );
    });

    it('renders in the requested locale', async () => {
      await service.sendPasswordReset(
        'user@test.com',
        'token456',
        'Jane',
        'es'
      );

      expect(renderEmail).toHaveBeenCalledWith(
        'reset-password',
        expect.objectContaining({ locale: 'es' })
      );
    });
  });
});
