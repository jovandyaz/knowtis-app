import { renderEmail } from './render';

const VERIFICATION_CODE = '482913';
const VERIFICATION_URL = 'https://knowtis.app/verify-email?token=abc123';

const codeBlockOf = (html: string): string => {
  const match = html.match(
    new RegExp(`<p[^>]*>\\s*${VERIFICATION_CODE}\\s*</p>`)
  );
  if (!match) {
    throw new Error(`No element renders the code ${VERIFICATION_CODE}`);
  }
  return match[0];
};

describe('renderEmail', () => {
  it('renders verify-email template to HTML with name and URL', async () => {
    const html = await renderEmail('verify-email', {
      name: 'John',
      verificationUrl: VERIFICATION_URL,
      code: VERIFICATION_CODE,
      locale: 'en',
    });

    expect(html).toContain('John');
    expect(html).toContain(VERIFICATION_URL);
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
      code: VERIFICATION_CODE,
      locale: 'es',
    });

    expect(html).toContain('Carlos');
    expect(html).toContain('Verificar');
  });
});

describe('verify-email verification code', () => {
  const renderVerifyEmail = (locale: 'en' | 'es') =>
    renderEmail('verify-email', {
      name: 'John',
      verificationUrl: VERIFICATION_URL,
      code: VERIFICATION_CODE,
      locale,
    });

  it('renders the code in the body', async () => {
    const html = await renderVerifyEmail('en');

    expect(codeBlockOf(html)).toContain(VERIFICATION_CODE);
  });

  it('renders the code large, monospaced and generously letter-spaced', async () => {
    const codeBlock = codeBlockOf(await renderVerifyEmail('en'));

    expect(codeBlock).toMatch(/font-family:[^;"]*monospace/);
    expect(codeBlock).toContain('font-size:32px');
    expect(codeBlock).toContain('letter-spacing:8px');
  });

  it('carries the code in the preheader', async () => {
    const html = await renderVerifyEmail('en');

    expect(html).toContain(`Your verification code is ${VERIFICATION_CODE}`);
  });

  it('carries the code in the Spanish preheader and labels it', async () => {
    const html = await renderVerifyEmail('es');

    expect(html).toContain(`Tu código de verificación es ${VERIFICATION_CODE}`);
    expect(html).toContain('Código de verificación');
  });

  it('keeps the verification link below the code as a fallback', async () => {
    const html = await renderVerifyEmail('en');

    expect(html.indexOf(codeBlockOf(html))).toBeLessThan(
      html.indexOf(`href="${VERIFICATION_URL}"`)
    );
  });

  it('states the code expiry apart from the link expiry', async () => {
    const html = await renderVerifyEmail('en');

    expect(html).toContain('This code expires in 15 minutes.');
    expect(html).toContain('This link expires in 24 hours.');
  });

  it('tells a reader who never signed up to ignore the email', async () => {
    const english = await renderVerifyEmail('en');
    const spanish = await renderVerifyEmail('es');

    expect(english).toContain(
      'create an account, you can safely ignore this email.'
    );
    expect(spanish).toContain(
      'Si no creaste una cuenta, puedes ignorar este mensaje.'
    );
  });

  it('never leaks the raw placeholder when the code is empty', async () => {
    const html = await renderEmail('verify-email', {
      name: 'John',
      verificationUrl: VERIFICATION_URL,
      code: '',
      locale: 'en',
    });

    expect(html).not.toContain('{{code}}');
  });

  it('leaves reset-password without a code block', async () => {
    const html = await renderEmail('reset-password', {
      name: 'Jane',
      resetUrl: 'https://knowtis.app/reset-password?token=xyz789',
      locale: 'en',
    });

    expect(html).not.toContain('letter-spacing:8px');
  });
});
