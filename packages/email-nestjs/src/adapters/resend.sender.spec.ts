import { EmailSendError } from '../ports/email-sender.port';
import { ResendSender } from './resend.sender';

const mockSend = vi.fn();

vi.mock('resend', () => {
  return {
    Resend: class MockResend {
      emails = { send: mockSend };
    },
  };
});

describe('ResendSender', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends email via Resend SDK', async () => {
    mockSend.mockResolvedValue({ data: { id: 'email_123' }, error: null });

    const sender = new ResendSender('re_test_key');
    const result = await sender.send({
      to: 'user@test.com',
      subject: 'Test',
      html: '<p>Hello</p>',
      from: 'noreply@knowtis.com',
    });

    expect(result.isOk()).toBe(true);
    expect(mockSend).toHaveBeenCalledWith({
      from: 'noreply@knowtis.com',
      to: 'user@test.com',
      subject: 'Test',
      html: '<p>Hello</p>',
    });
  });

  it('returns error when Resend API returns error', async () => {
    mockSend.mockResolvedValue({
      data: null,
      error: { message: 'API key invalid' },
    });

    const sender = new ResendSender('re_bad_key');
    const result = await sender.send({
      to: 'user@test.com',
      subject: 'Test',
      html: '<p>Hello</p>',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBeInstanceOf(EmailSendError);
      expect(result.error.message).toBe('API key invalid');
    }
  });

  it('returns error when Resend SDK throws', async () => {
    mockSend.mockRejectedValue(new Error('Network error'));

    const sender = new ResendSender('re_test_key');
    const result = await sender.send({
      to: 'user@test.com',
      subject: 'Test',
      html: '<p>Hello</p>',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toBe('Failed to send email');
    }
  });
});
