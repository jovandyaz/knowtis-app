import { renderEmail } from './render';

describe('renderEmail', () => {
  it('renders verify-email template to HTML with name and URL', async () => {
    const html = await renderEmail('verify-email', {
      name: 'John',
      verificationUrl: 'https://knowtis.app/verify-email?token=abc123',
      locale: 'en',
    });

    expect(html).toContain('John');
    expect(html).toContain('https://knowtis.app/verify-email?token=abc123');
    expect(html).toContain('Verify');
  });

  it('renders reset-password template to HTML', async () => {
    const html = await renderEmail('reset-password', {
      name: 'Jane',
      resetUrl: 'https://knowtis.app/reset-password?token=xyz789',
      locale: 'en',
    });

    expect(html).toContain('Jane');
    expect(html).toContain('https://knowtis.app/reset-password?token=xyz789');
    expect(html).toContain('Reset');
  });

  it('renders templates in Spanish', async () => {
    const html = await renderEmail('verify-email', {
      name: 'Carlos',
      verificationUrl: 'https://knowtis.app/verify-email?token=abc',
      locale: 'es',
    });

    expect(html).toContain('Carlos');
    expect(html).toContain('Verificar');
  });
});
