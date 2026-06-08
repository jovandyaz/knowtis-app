import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { describe, expect, it, vi } from 'vitest';

import type { EnvConfig } from '../../config/env.config';
import type { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import { AgentGateway } from './agent.gateway';
import type { RunAgentTurnHandler } from './application/run-agent-turn.handler';

function makeGateway(handler: Partial<RunAgentTurnHandler> = {}) {
  const config = {
    get: vi.fn(() => 2),
  } as unknown as ConfigService<EnvConfig, true>;
  return new AgentGateway(
    { execute: vi.fn(), ...handler } as unknown as RunAgentTurnHandler,
    {} as unknown as JwtService,
    {} as unknown as FeatureFlagsService,
    config
  );
}

function makeClient(userId?: string, id = 'c1') {
  return {
    id,
    data: userId ? { userId } : {},
    emit: vi.fn(),
  };
}

describe('AgentGateway', () => {
  it('rejects an unauthenticated message', async () => {
    const gateway = makeGateway();
    const client = makeClient();

    await gateway.handleMessage(client as never, {
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(client.emit).toHaveBeenCalledWith(
      'agent:error',
      expect.objectContaining({ code: 'AUTH_REQUIRED' })
    );
  });

  it('rejects an invalid payload (empty messages)', async () => {
    const gateway = makeGateway();
    const client = makeClient('u1');

    await gateway.handleMessage(client as never, { messages: [] });

    expect(client.emit).toHaveBeenCalledWith(
      'agent:error',
      expect.objectContaining({ code: 'VALIDATION_ERROR' })
    );
  });

  it('delegates a valid message to the handler', async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    const gateway = makeGateway({ execute });
    const client = makeClient('u1');

    await gateway.handleMessage(client as never, {
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(execute).toHaveBeenCalledOnce();
    expect(execute.mock.calls[0][0]).toMatchObject({ userId: 'u1' });
  });

  it('cancel aborts only the requesting client’s turns', async () => {
    const signals: Record<string, AbortSignal | undefined> = {};
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const execute = vi.fn(
      async (input: { userId: string }, _cb, signal: AbortSignal) => {
        signals[input.userId] = signal;
        await gate;
      }
    );
    const gateway = makeGateway({ execute } as Partial<RunAgentTurnHandler>);
    const clientA = makeClient('userA', 'A');
    const clientB = makeClient('userB', 'B');
    const msg = { messages: [{ role: 'user', content: 'hi' }] };

    const turnA = gateway.handleMessage(clientA as never, msg);
    const turnB = gateway.handleMessage(clientB as never, msg);
    await Promise.resolve();

    gateway.handleCancel(clientA as never);

    expect(signals['userA']?.aborted).toBe(true);
    expect(signals['userB']?.aborted).toBe(false);

    release();
    await Promise.all([turnA, turnB]);
  });
});
