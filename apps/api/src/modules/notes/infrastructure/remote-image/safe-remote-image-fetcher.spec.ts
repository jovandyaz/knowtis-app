import {
  createServer,
  type IncomingHttpHeaders,
  type Server,
  type ServerResponse,
} from 'node:http';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { MAX_IMAGE_BYTES } from '../../domain/image-type';
import { imageImportError } from '../../domain/ports/remote-image-fetcher.port';
import { SafeRemoteImageFetcher } from './safe-remote-image-fetcher';

const LOOPBACK = '127.0.0.1';
const UNLISTED_LOOPBACK = '127.0.0.2';
const TEST_BUDGET_MS = 3_000;
const SHORT_BUDGET_MS = 150;
const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52,
]);
const MAX_REDIRECTS = 3;

type Handler = (response: ServerResponse) => void;

const handlers = new Map<string, Handler>();
const received: { path: string; headers: IncomingHttpHeaders }[] = [];
let server: Server;
let port: number;

const serve = (path: string, handler: Handler) => handlers.set(path, handler);
const urlOf = (path: string, host = LOOPBACK) =>
  new URL(`http://${host}:${port}${path}`);
const pathsReceived = () => received.map(({ path }) => path);

const png: Handler = (response) =>
  response.writeHead(200, { 'Content-Type': 'image/png' }).end(PNG_BYTES);

const redirectTo =
  (location: string, status = 302): Handler =>
  (response) =>
    response.writeHead(status, { Location: location }).end();

function redirectChain(length: number) {
  for (let hop = length; hop > 0; hop -= 1) {
    serve(`/hop/${hop}`, redirectTo(`/hop/${hop - 1}`));
  }
  serve('/hop/0', png);
}

const allowingLoopback = (timeoutMs = TEST_BUDGET_MS) =>
  new SafeRemoteImageFetcher({ allowedIps: [LOOPBACK], timeoutMs });

const allowing = (...allowedIps: string[]) =>
  new SafeRemoteImageFetcher({ allowedIps, timeoutMs: TEST_BUDGET_MS });

const openSignal = () => new AbortController().signal;

async function importError(fetcher: SafeRemoteImageFetcher, url: URL) {
  const result = await fetcher.fetch(url, openSignal());
  return result._unsafeUnwrapErr();
}

beforeAll(async () => {
  server = createServer((request, response) => {
    const path = request.url ?? '';
    received.push({ path, headers: request.headers });
    const handler = handlers.get(path);
    if (handler) {
      handler(response);
    } else {
      response.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, LOOPBACK, resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('the test server has no TCP port');
  }
  port = address.port;
});

afterEach(() => {
  handlers.clear();
  received.length = 0;
  server.closeAllConnections();
});

afterAll(
  () =>
    new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    )
);

describe('SafeRemoteImageFetcher', () => {
  it('returns the bytes of a PNG with the type read from them', async () => {
    serve('/image', png);

    const result = await allowingLoopback().fetch(
      urlOf('/image'),
      openSignal()
    );

    expect(result._unsafeUnwrap()).toEqual({
      data: PNG_BYTES,
      mimeType: 'image/png',
    });
  });

  it('follows three redirects to the image', async () => {
    redirectChain(MAX_REDIRECTS);

    const result = await allowingLoopback().fetch(
      urlOf(`/hop/${MAX_REDIRECTS}`),
      openSignal()
    );

    expect(result._unsafeUnwrap().mimeType).toBe('image/png');
    expect(pathsReceived()).toEqual(['/hop/3', '/hop/2', '/hop/1', '/hop/0']);
  });

  it('refuses a fourth redirect without following it', async () => {
    redirectChain(MAX_REDIRECTS + 1);

    const error = await importError(
      allowingLoopback(),
      urlOf(`/hop/${MAX_REDIRECTS + 1}`)
    );

    expect(error).toEqual(imageImportError('fetch_failed'));
    expect(pathsReceived()).toEqual(['/hop/4', '/hop/3', '/hop/2', '/hop/1']);
  });

  it.each([301, 302, 303, 307, 308])(
    'follows a %i redirect',
    async (status) => {
      serve('/moved', redirectTo('/image', status));
      serve('/image', png);

      const result = await allowingLoopback().fetch(
        urlOf('/moved'),
        openSignal()
      );

      expect(result._unsafeUnwrap().mimeType).toBe('image/png');
    }
  );

  it.each(['ftp://127.0.0.1/image.png', 'file:///etc/passwd'])(
    'refuses a redirect to %s',
    async (location) => {
      serve('/moved', redirectTo(location));

      const error = await importError(allowingLoopback(), urlOf('/moved'));

      expect(error).toEqual(imageImportError('fetch_failed'));
    }
  );

  it('refuses a body whose Content-Length exceeds the cap before reading it', async () => {
    serve('/huge', (response) => {
      response.writeHead(200, {
        'Content-Type': 'image/png',
        'Content-Length': String(MAX_IMAGE_BYTES + 1),
      });
      response.write(PNG_BYTES);
    });

    const error = await importError(allowingLoopback(), urlOf('/huge'));

    expect(error).toEqual(imageImportError('too_large'));
  });

  it('refuses a streamed body that grows past the cap without a Content-Length', async () => {
    serve('/huge', (response) => {
      response.writeHead(200, {
        'Content-Type': 'image/png',
        'Transfer-Encoding': 'chunked',
      });
      response.write(PNG_BYTES);
      response.end(Buffer.alloc(MAX_IMAGE_BYTES));
    });

    const error = await importError(allowingLoopback(), urlOf('/huge'));

    expect(error).toEqual(imageImportError('too_large'));
  });

  it('accepts an image of exactly the cap', async () => {
    const image = Buffer.concat([
      PNG_BYTES,
      Buffer.alloc(MAX_IMAGE_BYTES - PNG_BYTES.length),
    ]);
    serve('/cap', (response) => {
      response.writeHead(200, { 'Transfer-Encoding': 'chunked' });
      response.end(image);
    });

    const result = await allowingLoopback().fetch(urlOf('/cap'), openSignal());

    expect(result._unsafeUnwrap().data.length).toBe(MAX_IMAGE_BYTES);
  });

  it('times out on a server that never answers', async () => {
    serve('/silent', () => undefined);

    const error = await importError(
      allowingLoopback(SHORT_BUDGET_MS),
      urlOf('/silent')
    );

    expect(error).toEqual(imageImportError('timeout'));
  });

  it('times out on a body that stalls after the headers', async () => {
    serve('/stall', (response) => {
      response.writeHead(200, { 'Content-Type': 'image/png' });
      response.write(PNG_BYTES);
    });

    const error = await importError(
      allowingLoopback(SHORT_BUDGET_MS),
      urlOf('/stall')
    );

    expect(error).toEqual(imageImportError('timeout'));
  });

  it('stops when the caller aborts', async () => {
    serve('/silent', () => undefined);
    const controller = new AbortController();

    const pending = allowingLoopback().fetch(
      urlOf('/silent'),
      controller.signal
    );
    controller.abort();

    expect((await pending)._unsafeUnwrapErr()).toEqual(
      imageImportError('timeout')
    );
  });

  it('refuses HTML served under an image/png header', async () => {
    serve('/fake', (response) =>
      response
        .writeHead(200, { 'Content-Type': 'image/png' })
        .end('<!doctype html><html><body>not an image</body></html>')
    );

    const error = await importError(allowingLoopback(), urlOf('/fake'));

    expect(error).toEqual(imageImportError('unsupported_type'));
  });

  it('fails on a response other than 200', async () => {
    const error = await importError(allowingLoopback(), urlOf('/missing'));

    expect(error).toEqual(imageImportError('fetch_failed'));
  });

  it('refuses a loopback IP that is not on the allow list, without connecting', async () => {
    serve('/image', png);
    const fetcher = allowing();

    const error = await importError(fetcher, urlOf('/image'));

    expect(error).toEqual(imageImportError('blocked_address'));
    expect(pathsReceived()).toEqual([]);
  });

  it.each([
    '169.254.169.254',
    '[fd12::1]',
    '[::ffff:127.0.0.1]',
    '2130706433',
    '0.0.0.0',
    '100.64.0.1',
    '[fe80::1]',
  ])('refuses the reserved address %s, without connecting', async (host) => {
    serve('/image', png);

    const error = await importError(allowing(), urlOf('/image', host));

    expect(error).toEqual(imageImportError('blocked_address'));
    expect(pathsReceived()).toEqual([]);
  });

  it.each(['::1', '0:0:0:0:0:0:0:1/128'])(
    'lets [::1] past the address filter when the allow list holds %s',
    async (entry) => {
      const error = await importError(
        allowing(entry),
        urlOf('/image', '[::1]')
      );

      expect(error).toEqual(imageImportError('fetch_failed'));
    }
  );

  it('keeps [::1] blocked when a single allowed IP spells it another way, since single IPs match by text', async () => {
    const error = await importError(
      allowing('0:0:0:0:0:0:0:1'),
      urlOf('/image', '[::1]')
    );

    expect(error).toEqual(imageImportError('blocked_address'));
  });

  it('refuses a hostname that resolves to loopback, without connecting', async () => {
    serve('/image', png);
    const fetcher = allowing();

    const error = await importError(fetcher, urlOf('/image', 'localhost'));

    expect(error).toEqual(imageImportError('blocked_address'));
    expect(pathsReceived()).toEqual([]);
  });

  it('refuses a private address over https too, without connecting', async () => {
    serve('/image', png);
    const fetcher = allowing();

    const error = await importError(
      fetcher,
      new URL(`https://localhost:${port}/image`)
    );

    expect(error).toEqual(imageImportError('blocked_address'));
    expect(pathsReceived()).toEqual([]);
  });

  it('checks the address of every redirect hop', async () => {
    serve('/moved', redirectTo(`http://${UNLISTED_LOOPBACK}:${port}/image`));

    const error = await importError(allowingLoopback(), urlOf('/moved'));

    expect(error).toEqual(imageImportError('blocked_address'));
  });

  it('refuses credentials in the URL, without connecting', async () => {
    serve('/image', png);
    const url = urlOf('/image');
    url.username = 'user';
    url.password = 'secret';

    const error = await importError(allowingLoopback(), url);

    expect(error).toEqual(imageImportError('blocked_address'));
    expect(pathsReceived()).toEqual([]);
  });

  it('refuses a redirect to a URL with credentials, without following it', async () => {
    serve('/moved', redirectTo(`http://user:secret@${LOOPBACK}:${port}/image`));
    serve('/image', png);

    const error = await importError(allowingLoopback(), urlOf('/moved'));

    expect(error).toEqual(imageImportError('blocked_address'));
    expect(pathsReceived()).toEqual(['/moved']);
  });

  it('sends only its identifying User-Agent and Accept, never a cookie or authorization', async () => {
    serve('/image', png);

    await allowingLoopback().fetch(urlOf('/image'), openSignal());

    const [{ headers }] = received;
    expect(Object.keys(headers).sort()).toEqual([
      'accept',
      'connection',
      'host',
      'user-agent',
    ]);
    expect(headers['user-agent']).toBe(
      'Knowtis-ImageImport/1.0 (+https://knowtis.app)'
    );
    expect(headers.accept).toBe('image/*');
  });
});
