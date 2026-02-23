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
        `<html><body>${props['name'] as string} ${(props['verificationUrl'] as string) ?? (props['resetUrl'] as string) ?? ''}</body></html>`
      );
    }),
  };
});

describe('AuthEmailService', () => {
  let mockSender: EmailSender;
  let service: AuthEmailService;

  beforeEach(() => {
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
        'abc123',
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
      await service.sendEmailVerification('user@test.com', 'token123', 'Jane');

      expect(mockSender.send).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining(
            'https://knowtis.app/verify-email?token=token123'
          ),
        })
      );
    });

    it('returns error when sender fails', async () => {
      vi.mocked(mockSender.send).mockResolvedValue(
        err(new EmailSendError('Send failed'))
      );

      const result = await service.sendEmailVerification(
        'user@test.com',
        'abc123',
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
  });
});
