import type { Logger } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import { describe, expect, it, vi } from 'vitest';

import { authenticateSocket, type AuthenticatedSocket } from './socket-auth';

function makeLogger(): Logger {
  return { log: vi.fn(), warn: vi.fn() } as unknown as Logger;
}

function makeJwt(): JwtService {
  return {
    verify: vi.fn().mockReturnValue({ sub: 'user-1' }),
  } as unknown as JwtService;
}

function makeClient(
  headers: Record<string, string | string[]>,
  address = '10.0.0.9'
): AuthenticatedSocket {
  return {
    id: 'c1',
    data: {},
    handshake: { auth: { token: 'jwt' }, headers, address },
  } as unknown as AuthenticatedSocket;
}

describe('authenticateSocket client IP', () => {
  it('stores the x-real-ip header on client.data.clientIp', () => {
    const client = makeClient({ 'x-real-ip': '203.0.113.7' });

    const result = authenticateSocket(client, makeJwt(), makeLogger(), 'ai');

    expect(result.ok).toBe(true);
    expect(client.data.clientIp).toBe('203.0.113.7');
  });

  it('falls back to the handshake address when the header is missing', () => {
    const client = makeClient({});

    authenticateSocket(client, makeJwt(), makeLogger(), 'ai');

    expect(client.data.clientIp).toBe('10.0.0.9');
  });
});
