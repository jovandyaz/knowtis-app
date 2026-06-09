import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { describe, expect, it, vi } from 'vitest';

import type { EnvConfig } from '../../config/env.config';
import type { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import { AgentGateway } from './agent.gateway';
import type { ApproveMutationHandler } from './application/approve-mutation.handler';
import type { RejectMutationHandler } from './application/reject-mutation.handler';
import type { RunAgentTurnHandler } from './application/run-agent-turn.handler';

interface MakeGatewayOptions {
  handler?: Partial<RunAgentTurnHandler>;
  approve?: Partial<ApproveMutationHandler>;
  reject?: Partial<RejectMutationHandler>;
  jwt?: Partial<JwtService>;
  featureFlags?: Partial<FeatureFlagsService>;
}

function makeGateway({
  handler = {},
  approve = {},
  reject = {},
  jwt = {},
  featureFlags = {},
}: MakeGatewayOptions = {}) {
  const config = {
    get: vi.fn(() => 2),
  } as unknown as ConfigService<EnvConfig, true>;
  return new AgentGateway(
    { execute: vi.fn(), ...handler } as unknown as RunAgentTurnHandler,
    { execute: vi.fn(), ...approve } as unknown as ApproveMutationHandler,
    { execute: vi.fn(), ...reject } as unknown as RejectMutationHandler,
    jwt as unknown as JwtService,
    featureFlags as unknown as FeatureFlagsService,
    config
  );
}

function makeClient(userId?: string, id = 'c1', token?: string) {
  return {
    id,
    data: userId ? { userId } : {},
    emit: vi.fn(),
    disconnect: vi.fn(),
    handshake: { auth: token ? { token } : {}, headers: {} },
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
    const gateway = makeGateway({ handler: { execute } });
    const client = makeClient('u1');

    await gateway.handleMessage(client as never, {
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(execute).toHaveBeenCalledOnce();
    expect(execute.mock.calls[0][0]).toMatchObject({ userId: 'u1' });
  });

  it("cancel aborts only the requesting client's turns", async () => {
    const signals: Record<string, AbortSignal | undefined> = {};
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const execute = vi.fn(
      async (input: { userId: string }, _cb: unknown, signal: AbortSignal) => {
        signals[input.userId] = signal;
        await gate;
      }
    );
    const gateway = makeGateway({
      handler: { execute } as Partial<RunAgentTurnHandler>,
    });
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

  it('rejects messages array length > 40 with VALIDATION_ERROR', async () => {
    const gateway = makeGateway();
    const client = makeClient('u1');
    const messages = Array.from({ length: 41 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: 'hi',
    }));
    messages[40] = { role: 'user', content: 'final' };

    await gateway.handleMessage(client as never, { messages });

    expect(client.emit).toHaveBeenCalledWith(
      'agent:error',
      expect.objectContaining({ code: 'VALIDATION_ERROR' })
    );
  });

  it('rejects a message with content length > 20000 with VALIDATION_ERROR', async () => {
    const gateway = makeGateway();
    const client = makeClient('u1');

    await gateway.handleMessage(client as never, {
      messages: [{ role: 'user', content: 'x'.repeat(20001) }],
    });

    expect(client.emit).toHaveBeenCalledWith(
      'agent:error',
      expect.objectContaining({ code: 'VALIDATION_ERROR' })
    );
  });

  it('rejects payload where last message role is assistant with VALIDATION_ERROR', async () => {
    const gateway = makeGateway();
    const client = makeClient('u1');

    await gateway.handleMessage(client as never, {
      messages: [
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'hello' },
      ],
    });

    expect(client.emit).toHaveBeenCalledWith(
      'agent:error',
      expect.objectContaining({ code: 'VALIDATION_ERROR' })
    );
  });

  it('rejects an invalid role value with VALIDATION_ERROR', async () => {
    const gateway = makeGateway();
    const client = makeClient('u1');

    await gateway.handleMessage(client as never, {
      messages: [{ role: 'system', content: 'hi' }],
    });

    expect(client.emit).toHaveBeenCalledWith(
      'agent:error',
      expect.objectContaining({ code: 'VALIDATION_ERROR' })
    );
  });

  it('rejects a 3rd concurrent turn for the same user with AI_RATE_LIMIT_EXCEEDED', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const execute = vi.fn(
      async (_input: unknown, _cb: unknown, signal: AbortSignal) => {
        await gate;
        void signal;
      }
    );
    const gateway = makeGateway({
      handler: { execute } as Partial<RunAgentTurnHandler>,
    });
    const client = makeClient('u1');
    const msg = { messages: [{ role: 'user', content: 'hi' }] };

    const turn1 = gateway.handleMessage(client as never, msg);
    const turn2 = gateway.handleMessage(client as never, msg);
    await Promise.resolve();
    await Promise.resolve();

    const clientRejected = makeClient('u1', 'c2');
    await gateway.handleMessage(clientRejected as never, msg);

    expect(clientRejected.emit).toHaveBeenCalledWith(
      'agent:error',
      expect.objectContaining({ code: 'AI_RATE_LIMIT_EXCEEDED' })
    );

    release();
    await Promise.all([turn1, turn2]);
  });

  it('disconnects and emits featureDisabled when ai_enabled flag is off', async () => {
    const jwt = { verify: vi.fn().mockReturnValue({ sub: 'u1' }) };
    const featureFlags = { isEnabled: vi.fn().mockResolvedValue(false) };
    const gateway = makeGateway({ jwt, featureFlags });
    const client = makeClient(undefined, 'c1', 'valid-token');

    await gateway.handleConnection(client as never);

    expect(client.emit).toHaveBeenCalledWith(
      'agent:error',
      expect.objectContaining({ code: 'AI_FEATURE_DISABLED' })
    );
    expect(client.disconnect).toHaveBeenCalled();
  });

  it('disconnects and emits AUTH_REQUIRED when JWT verification throws', async () => {
    const jwt = {
      verify: vi.fn().mockImplementation(() => {
        throw new Error('bad token');
      }),
    };
    const featureFlags = { isEnabled: vi.fn().mockResolvedValue(true) };
    const gateway = makeGateway({ jwt, featureFlags });
    const client = makeClient(undefined, 'c1', 'bad-token');

    await gateway.handleConnection(client as never);

    expect(client.emit).toHaveBeenCalledWith(
      'agent:error',
      expect.objectContaining({ code: 'AUTH_REQUIRED' })
    );
    expect(client.disconnect).toHaveBeenCalled();
  });
});
