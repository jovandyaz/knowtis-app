import type { AddressInfo } from 'node:net';

import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { Test } from '@nestjs/testing';
import { io, type Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import { AgentGateway } from './agent.gateway';
import { ApproveMutationHandler } from './application/approve-mutation.handler';
import { RejectMutationHandler } from './application/reject-mutation.handler';
import { RunAgentTurnHandler } from './application/run-agent-turn.handler';
import { TurnClaimService } from './infrastructure/turn-claim/turn-claim.service';
import { createInMemoryClaimRedis } from './testing/create-in-memory-claim-redis';

const JWT_SECRET = 'agent-gateway-ack-spec';
const HOST = '127.0.0.1';
const ACK_TIMEOUT_MS = 2_000;

describe('AgentGateway acknowledgements over socket.io', () => {
  let app: INestApplication;
  let client: Socket;
  let releaseTurn = () => {};
  const execute = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        releaseTurn = resolve;
      })
  );

  beforeEach(async () => {
    execute.mockClear();
    const jwtService = new JwtService({ secret: JWT_SECRET });
    const moduleRef = await Test.createTestingModule({
      providers: [
        AgentGateway,
        { provide: RunAgentTurnHandler, useValue: { execute } },
        { provide: ApproveMutationHandler, useValue: { execute: vi.fn() } },
        { provide: RejectMutationHandler, useValue: { execute: vi.fn() } },
        {
          provide: TurnClaimService,
          useValue: new TurnClaimService(createInMemoryClaimRedis().provider),
        },
        { provide: JwtService, useValue: jwtService },
        {
          provide: FeatureFlagsService,
          useValue: { isEnabled: vi.fn().mockResolvedValue(true) },
        },
        { provide: ConfigService, useValue: { get: () => 2 } },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useWebSocketAdapter(new IoAdapter(app));
    await app.listen(0, HOST);
    const { port } = app.getHttpServer().address() as AddressInfo;
    client = io(`http://${HOST}:${port}/agent`, {
      auth: { token: jwtService.sign({ sub: 'user-1' }) },
      transports: ['websocket'],
    });
  });

  afterEach(async () => {
    releaseTurn();
    client.disconnect();
    await app.close();
  });

  it('acknowledges agent:message while the turn is still running', async () => {
    await client
      .timeout(ACK_TIMEOUT_MS)
      .emitWithAck('agent:message', { message: { content: 'hi' } });

    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute.mock.settledResults[0]?.type).toBe('incomplete');
  });

  it('acknowledges a malformed agent:message before it is refused', async () => {
    const refusal = new Promise<{ code: string }>((resolve) =>
      client.once('agent:error', resolve)
    );

    await client
      .timeout(ACK_TIMEOUT_MS)
      .emitWithAck('agent:message', { message: {} });

    await expect(refusal).resolves.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it('acknowledges agent:cancel', async () => {
    await expect(
      client.timeout(ACK_TIMEOUT_MS).emitWithAck('agent:cancel')
    ).resolves.toBeUndefined();
  });
});
