import { createServer, type Server } from 'node:http';

const LOOPBACK = '127.0.0.1';
const HTTP_OK = 200;

/** A public-looking name for the canary: `isHttpUrl` refuses loopback hosts, so a loopback URL would be refused before any allowlist were consulted. */
export const CANARY_HOSTNAME = 'canary.attacker.test';

export interface CanaryHit {
  readonly method: string;
  readonly path: string;
}

export interface CanaryHost {
  readonly hostname: typeof CANARY_HOSTNAME;
  /** Every request the server received, in order. */
  readonly hits: readonly CanaryHit[];
  /** The public-looking URL of `path`, the one payloads carry. */
  url(path: string): string;
  /** Where the server really listens for `path`. */
  loopbackUrl(path: string): string;
  close(): Promise<void>;
}

/** Starts a loopback HTTP server on a free port that answers every request with 200 and records it. */
export async function startCanaryHost(): Promise<CanaryHost> {
  const hits: CanaryHit[] = [];
  const server: Server = createServer((request, response) => {
    hits.push({ method: request.method ?? '', path: request.url ?? '' });
    response.writeHead(HTTP_OK, { 'Content-Type': 'text/plain' }).end('ok');
  });
  await new Promise<void>((resolve) => server.listen(0, LOOPBACK, resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('the canary server has no TCP port');
  }
  const origin = `http://${LOOPBACK}:${address.port}`;
  return {
    hostname: CANARY_HOSTNAME,
    hits,
    url: (path) => `https://${CANARY_HOSTNAME}${path}`,
    loopbackUrl: (path) => `${origin}${path}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
