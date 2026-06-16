import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { err, ok } from 'neverthrow';
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
  featureFlags,
}: MakeGatewayOptions = {}) {
  const config = {
    get: vi.fn(() => 2),
  } as unknown as ConfigService<EnvConfig, true>;
  return new AgentGateway(
    { execute: vi.fn(), ...handler } as unknown as RunAgentTurnHandler,
    { execute: vi.fn(), ...approve } as unknown as ApproveMutationHandler,
    { execute: vi.fn(), ...reject } as unknown as RejectMutationHandler,
    jwt as unknown as JwtService,
    (featureFlags ?? {
      isEnabled: vi.fn().mockResolvedValue(true),
    }) as unknown as FeatureFlagsService,
    config
  );
}

function flushAsync() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function makeClient(userId?: string, id = 'c1', token?: string) {
  return {
    id,
    connected: true,
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
      message: { content: 'hi' },
    });

    expect(client.emit).toHaveBeenCalledWith(
      'agent:error',
      expect.objectContaining({ code: 'AUTH_REQUIRED' })
    );
  });

  it('rejects an invalid payload (missing message field)', async () => {
    const gateway = makeGateway();
    const client = makeClient('u1');

    await gateway.handleMessage(client as never, {
      noteId: '11111111-1111-4111-8111-111111111111',
    });

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
      message: { content: 'hi' },
    });

    expect(execute).toHaveBeenCalledOnce();
    expect(execute.mock.calls[0][0]).toMatchObject({ userId: 'u1' });
  });

  it('routes the {message} payload to execute with a single message', async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    const gateway = makeGateway({ handler: { execute } });
    const client = makeClient('u1');

    await gateway.handleMessage(client as never, {
      message: { content: 'hello' },
      conversationId: '11111111-1111-4111-8111-111111111111',
    });

    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        message: { content: 'hello' },
        conversationId: '11111111-1111-4111-8111-111111111111',
      }),
      expect.anything(),
      expect.anything()
    );
  });

  it('rejects a payload with no message field', async () => {
    const gateway = makeGateway();
    const client = makeClient('u1');

    await gateway.handleMessage(client as never, {
      noteId: '11111111-1111-4111-8111-111111111111',
    });

    expect(client.emit).toHaveBeenCalledWith(
      'agent:error',
      expect.objectContaining({ code: 'VALIDATION_ERROR' })
    );
  });

  it('rejects a {message} payload with empty content', async () => {
    const gateway = makeGateway();
    const client = makeClient('u1');

    await gateway.handleMessage(client as never, { message: { content: '' } });

    expect(client.emit).toHaveBeenCalledWith(
      'agent:error',
      expect.objectContaining({ code: 'VALIDATION_ERROR' })
    );
  });

  it('rejects a {message} payload with a non-UUID conversationId', async () => {
    const gateway = makeGateway();
    const client = makeClient('u1');

    await gateway.handleMessage(client as never, {
      message: { content: 'hello' },
      conversationId: 'not-a-uuid',
    });

    expect(client.emit).toHaveBeenCalledWith(
      'agent:error',
      expect.objectContaining({ code: 'VALIDATION_ERROR' })
    );
  });

  it('rejects message content exceeding 20000 characters with VALIDATION_ERROR', async () => {
    const gateway = makeGateway();
    const client = makeClient('u1');

    await gateway.handleMessage(client as never, {
      message: { content: 'x'.repeat(20001) },
    });

    expect(client.emit).toHaveBeenCalledWith(
      'agent:error',
      expect.objectContaining({ code: 'VALIDATION_ERROR' })
    );
  });

  it('emits conversationId on agent:done when present', async () => {
    const execute = vi.fn(
      async (
        _input: unknown,
        cb: { onDone: (usage: unknown) => void }
      ): Promise<void> => {
        cb.onDone({
          inputTokens: 1,
          outputTokens: 1,
          model: 'm',
          costUsd: 0,
          sources: [],
          knownNotes: [],
          conversationId: 'conv-9',
        });
      }
    );
    const gateway = makeGateway({
      handler: { execute } as Partial<RunAgentTurnHandler>,
    });
    const client = makeClient('u1');

    await gateway.handleMessage(client as never, {
      message: { content: 'hi' },
    });

    expect(client.emit).toHaveBeenCalledWith(
      'agent:done',
      expect.objectContaining({ conversationId: 'conv-9' })
    );
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
    const msg = { message: { content: 'hi' } };

    const turnA = gateway.handleMessage(clientA as never, msg);
    const turnB = gateway.handleMessage(clientB as never, msg);
    await flushAsync();

    gateway.handleCancel(clientA as never);

    expect(signals['userA']?.aborted).toBe(true);
    expect(signals['userB']?.aborted).toBe(false);

    release();
    await Promise.all([turnA, turnB]);
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
    const msg = { message: { content: 'hi' } };

    const turn1 = gateway.handleMessage(client as never, msg);
    const turn2 = gateway.handleMessage(client as never, msg);
    await flushAsync();

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

  it('emits featureDisabled and does not start a turn when the flag turns off after connect', async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    const featureFlags = { isEnabled: vi.fn().mockResolvedValue(false) };
    const gateway = makeGateway({ handler: { execute }, featureFlags });
    const client = makeClient('u1');

    await gateway.handleMessage(client as never, {
      message: { content: 'hi' },
    });

    expect(client.emit).toHaveBeenCalledWith(
      'agent:error',
      expect.objectContaining({ code: 'AI_FEATURE_DISABLED' })
    );
    expect(execute).not.toHaveBeenCalled();
  });

  it('emits featureDisabled and does not commit an approve when the flag is off', async () => {
    const approveExecute = vi.fn();
    const featureFlags = { isEnabled: vi.fn().mockResolvedValue(false) };
    const gateway = makeGateway({
      approve: { execute: approveExecute },
      featureFlags,
    });
    const client = makeClient('u1');

    await gateway.handleApprove(client as never, approvePayload());

    expect(client.emit).toHaveBeenCalledWith(
      'agent:error',
      expect.objectContaining({ code: 'AI_FEATURE_DISABLED' })
    );
    expect(approveExecute).not.toHaveBeenCalled();
  });

  it('disconnects the client when the verified token expiry passes', async () => {
    vi.useFakeTimers();
    try {
      const exp = Math.floor((Date.now() + 60_000) / 1000);
      const jwt = { verify: vi.fn().mockReturnValue({ sub: 'u1', exp }) };
      const gateway = makeGateway({ jwt });
      const client = makeClient(undefined, 'c1', 'valid-token');

      await gateway.handleConnection(client as never);
      expect(client.disconnect).not.toHaveBeenCalled();

      vi.advanceTimersByTime(60_000 + 5_000 + 1_000);

      expect(client.emit).toHaveBeenCalledWith(
        'agent:error',
        expect.objectContaining({ code: 'AUTH_REQUIRED' })
      );
      expect(client.disconnect).toHaveBeenCalledWith(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not arm the expiry timer when the client disconnects during the flag check', async () => {
    vi.useFakeTimers();
    try {
      const exp = Math.floor((Date.now() + 60_000) / 1000);
      const jwt = { verify: vi.fn().mockReturnValue({ sub: 'u1', exp }) };
      const client = makeClient(undefined, 'c1', 'valid-token');
      const featureFlags = {
        isEnabled: vi.fn().mockImplementation(async () => {
          client.connected = false;
          return true;
        }),
      };
      const gateway = makeGateway({ jwt, featureFlags });

      await gateway.handleConnection(client as never);

      vi.advanceTimersByTime(120_000);

      expect(client.disconnect).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('clears the expiry timer when the client disconnects early', async () => {
    vi.useFakeTimers();
    try {
      const exp = Math.floor((Date.now() + 60_000) / 1000);
      const jwt = { verify: vi.fn().mockReturnValue({ sub: 'u1', exp }) };
      const gateway = makeGateway({ jwt });
      const client = makeClient(undefined, 'c1', 'valid-token');

      await gateway.handleConnection(client as never);
      gateway.handleDisconnect(client as never);

      vi.advanceTimersByTime(120_000);

      expect(client.disconnect).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('disconnects and emits AUTH_REQUIRED for MCP-source tokens', async () => {
    const jwt = {
      verify: vi.fn().mockReturnValue({ sub: 'u1', source: 'mcp' }),
    };
    const featureFlags = { isEnabled: vi.fn().mockResolvedValue(true) };
    const gateway = makeGateway({ jwt, featureFlags });
    const client = makeClient(undefined, 'c1', 'mcp-token');

    await gateway.handleConnection(client as never);

    expect(client.emit).toHaveBeenCalledWith(
      'agent:error',
      expect.objectContaining({ code: 'AUTH_REQUIRED' })
    );
    expect(client.disconnect).toHaveBeenCalled();
    expect(client.data).not.toHaveProperty('userId');
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

  const approvePayload = (
    proposalId = 'd4816ca2-7965-46ea-b828-3ecfe32428be'
  ) => ({
    proposalId,
  });

  it('approve commits then resumes the turn', async () => {
    const approveExecute = vi.fn().mockResolvedValue(
      ok({
        result: { noteId: 'n1', title: 'GTD', kind: 'create' },
        outcome: 'created the note "GTD"',
        toolName: 'proposeCreateNote',
        conversationId: 'conv-1',
      })
    );
    const resumeTurn = vi.fn().mockResolvedValue(undefined);
    const gateway = makeGateway({
      approve: { execute: approveExecute },
      handler: { resumeTurn } as Partial<RunAgentTurnHandler>,
    });
    const client = makeClient('u1');

    await gateway.handleApprove(client as never, approvePayload());

    expect(client.emit).toHaveBeenCalledWith(
      'agent:committed',
      expect.objectContaining({
        result: { noteId: 'n1', title: 'GTD', kind: 'create' },
      })
    );
    expect(resumeTurn).toHaveBeenCalledOnce();
    expect(resumeTurn.mock.calls[0][0]).toMatchObject({
      userId: 'u1',
      resume: { toolName: 'proposeCreateNote' },
    });
  });

  it('approve emits an error and does not resume when conversationId is missing', async () => {
    const approveExecute = vi.fn().mockResolvedValue(
      ok({
        result: { noteId: 'n1', title: 'GTD', kind: 'create' },
        outcome: 'created the note "GTD"',
        toolName: 'proposeCreateNote',
      })
    );
    const resumeTurn = vi.fn().mockResolvedValue(undefined);
    const gateway = makeGateway({
      approve: { execute: approveExecute },
      handler: { resumeTurn } as Partial<RunAgentTurnHandler>,
    });
    const client = makeClient('u1');

    await gateway.handleApprove(client as never, approvePayload());

    expect(client.emit).toHaveBeenCalledWith(
      'agent:committed',
      expect.anything()
    );
    expect(client.emit).toHaveBeenCalledWith(
      'agent:error',
      expect.objectContaining({ code: 'VALIDATION_ERROR' })
    );
    expect(resumeTurn).not.toHaveBeenCalled();
  });

  it('approve error neither commits nor resumes', async () => {
    const approveExecute = vi
      .fn()
      .mockResolvedValue(
        err({ code: 'AGENT_PROPOSAL_EXPIRED', message: 'expired' })
      );
    const resumeTurn = vi.fn().mockResolvedValue(undefined);
    const gateway = makeGateway({
      approve: { execute: approveExecute },
      handler: { resumeTurn } as Partial<RunAgentTurnHandler>,
    });
    const client = makeClient('u1');

    await gateway.handleApprove(client as never, approvePayload());

    expect(client.emit).toHaveBeenCalledWith(
      'agent:error',
      expect.objectContaining({ code: 'AGENT_PROPOSAL_EXPIRED' })
    );
    expect(client.emit).not.toHaveBeenCalledWith(
      'agent:committed',
      expect.anything()
    );
    expect(resumeTurn).not.toHaveBeenCalled();
  });

  it('reject discards the proposal then resumes with the reason', async () => {
    const rejectExecute = vi.fn().mockResolvedValue(
      ok({
        outcome: 'The user rejected the proposal',
        toolName: 'proposeCreateNote',
        conversationId: 'conv-1',
      })
    );
    const resumeTurn = vi.fn().mockResolvedValue(undefined);
    const gateway = makeGateway({
      reject: { execute: rejectExecute },
      handler: { resumeTurn } as Partial<RunAgentTurnHandler>,
    });
    const client = makeClient('u1');

    await gateway.handleReject(client as never, {
      ...approvePayload(),
      reason: 'too long',
    });

    expect(rejectExecute).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', reason: 'too long' })
    );
    expect(client.emit).not.toHaveBeenCalledWith(
      'agent:committed',
      expect.anything()
    );
    expect(resumeTurn).toHaveBeenCalledOnce();
  });

  it('rejects an unauthenticated approve', async () => {
    const gateway = makeGateway();
    const client = makeClient();

    await gateway.handleApprove(client as never, approvePayload());

    expect(client.emit).toHaveBeenCalledWith(
      'agent:error',
      expect.objectContaining({ code: 'AUTH_REQUIRED' })
    );
  });

  it('rejects an unauthenticated reject', async () => {
    const gateway = makeGateway();
    const client = makeClient();

    await gateway.handleReject(client as never, approvePayload());

    expect(client.emit).toHaveBeenCalledWith(
      'agent:error',
      expect.objectContaining({ code: 'AUTH_REQUIRED' })
    );
  });

  it('rejects an approve with an invalid proposalId', async () => {
    const approveExecute = vi.fn();
    const gateway = makeGateway({ approve: { execute: approveExecute } });
    const client = makeClient('u1');

    await gateway.handleApprove(client as never, {
      ...approvePayload('not-a-uuid'),
    });

    expect(client.emit).toHaveBeenCalledWith(
      'agent:error',
      expect.objectContaining({ code: 'VALIDATION_ERROR' })
    );
    expect(approveExecute).not.toHaveBeenCalled();
  });

  it('rejects a reject with an invalid proposalId', async () => {
    const rejectExecute = vi.fn();
    const gateway = makeGateway({ reject: { execute: rejectExecute } });
    const client = makeClient('u1');

    await gateway.handleReject(client as never, {
      ...approvePayload('not-a-uuid'),
    });

    expect(client.emit).toHaveBeenCalledWith(
      'agent:error',
      expect.objectContaining({ code: 'VALIDATION_ERROR' })
    );
    expect(rejectExecute).not.toHaveBeenCalled();
  });
});
