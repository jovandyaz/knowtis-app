import { Logger } from '@nestjs/common';

import { ConsoleSender } from './console.sender';

const CODE = '680944';
const LINK = 'http://localhost:4200/verify-email?token=abc&next=/notes';

const VERIFICATION_HTML = [
  '<html><head><style>.code { color: red }</style></head>',
  '<body><div>&#8202;&#8202;​‌‍‎‏</div>',
  '<h1>Verify your email</h1>',
  '<p>Hi Jane,</p>',
  `<p>Your code is <strong>${CODE}</strong></p>`,
  '<p>It expires in 15&nbsp;minutes.</p>',
  `<p><a href="${LINK.replace('&', '&amp;')}" target="_blank">Verify email</a></p>`,
  '</body></html>',
].join('');

const MESSAGE = {
  to: 'jane@knowtis.test',
  subject: 'Verify your email — Knowtis',
  html: VERIFICATION_HTML,
  from: 'Knowtis <noreply@mail.knowtis.app>',
};

const DEVELOPMENT = 'development';
const TEST = 'test';
const PRODUCTION = 'production';
const UNLISTED_ENVIRONMENT = 'staging';

let logged: string[] = [];

function collect(...calls: unknown[][]): string[] {
  return calls
    .flat()
    .filter((entry): entry is string => typeof entry === 'string');
}

beforeEach(() => {
  logged = [];
  const capture = (message: unknown) => {
    logged.push(...collect([message]));
  };
  vi.spyOn(Logger.prototype, 'log').mockImplementation(capture);
  vi.spyOn(Logger.prototype, 'debug').mockImplementation(capture);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ConsoleSender', () => {
  it('prints the message body so the flow can be completed locally', async () => {
    await new ConsoleSender(DEVELOPMENT).send(MESSAGE);

    expect(logged.join('\n')).toContain(CODE);
  });

  it('prints the body as readable text rather than raw markup', async () => {
    await new ConsoleSender(DEVELOPMENT).send(MESSAGE);

    const output = logged.join('\n');
    expect(output).toContain('Your code is 680944');
    expect(output).toContain('It expires in 15 minutes.');
    expect(output).not.toContain('<strong>');
    expect(output).not.toContain('color: red');
  });

  it('keeps the action link, the only affordance a reset email carries', async () => {
    await new ConsoleSender(DEVELOPMENT).send(MESSAGE);

    expect(logged.join('\n')).toContain(`Verify email (${LINK})`);
  });

  it('drops the invisible padding a preview line is stuffed with', async () => {
    await new ConsoleSender(DEVELOPMENT).send(MESSAGE);

    const output = logged.join('\n');
    expect(output).not.toMatch(/[\u00AD\u200B-\u200F\uFEFF]/);
    expect(output).not.toContain('&#');
  });

  it('prints the body under the test runner, the other developer environment', async () => {
    await new ConsoleSender(TEST).send(MESSAGE);

    expect(logged.join('\n')).toContain(CODE);
  });

  it('keeps the body out of an environment nobody put on the list', async () => {
    await new ConsoleSender(UNLISTED_ENVIRONMENT).send(MESSAGE);

    expect(logged.join('\n')).not.toContain(CODE);
  });

  it('keeps the body out of a deployed environment’s logs', async () => {
    await new ConsoleSender(PRODUCTION).send(MESSAGE);

    const output = logged.join('\n');
    expect(output).not.toContain(CODE);
    expect(output).toContain(MESSAGE.to);
  });

  it('reports the envelope the message was sent with', async () => {
    await new ConsoleSender(PRODUCTION).send(MESSAGE);

    const output = logged.join('\n');
    expect(output).toContain(MESSAGE.to);
    expect(output).toContain(MESSAGE.subject);
    expect(output).toContain(MESSAGE.from);
  });
});
