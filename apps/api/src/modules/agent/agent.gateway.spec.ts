import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MetadataScanner } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { GatewayMetadataExplorer } from '@nestjs/websockets/gateway-metadata-explorer';
import { err, ok } from 'neverthrow';
import { v5 as uuidv5 } from 'uuid';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AGENT_STOP_REASON } from '@knowtis/shared-types';

import type { EnvConfig } from '../../config/env.config';
import { AIErrors } from '../ai/domain/errors/ai.errors';
import type { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import {
  SHUTDOWN_ABORT_REASON,
  ShutdownDrain,
} from '../websocket/shutdown-drain';
import { TOKEN_EXPIRY_GRACE_MS } from '../websocket/socket-expiry';
import { AgentGateway } from './agent.gateway';
import { ApproveMutationHandler } from './application/approve-mutation.handler';
import { RejectMutationHandler } from './application/reject-mutation.handler';
import type {
  RunAgentTurnCallbacks,
  RunAgentTurnHandler,
} from './application/run-agent-turn.handler';
import type {
  PendingMutationRecord,
  PendingMutationStore,
} from './domain/ports/pending-mutation.store';
import { ProposedMutation } from './domain/proposed-mutation';
import { TURN_ABORT_REASON } from './domain/turn-abort';
import { KNOWTIS_CONVERSATION_NAMESPACE } from './domain/turn-identity';
import { TurnClaimService } from './infrastructure/turn-claim/turn-claim.service';
import {
  createInMemoryClaimRedis,
  type InMemoryClaimRedis,
} from './testing/create-in-memory-claim-redis';

interface MakeGatewayOptions {
  handler?: Partial<RunAgentTurnHandler>;
  approve?: Partial<ApproveMutationHandler>;
  reject?: Partial<RejectMutationHandler>;
  jwt?: Partial<JwtService>;
  featureFlags?: Partial<FeatureFlagsService>;
  redis?: InMemoryClaimRedis;
  drain?: ShutdownDrain;
}

function makeGateway({
  handler = {},
  approve = {},
  reject = {},
  jwt = {},
  featureFlags,
  redis = createInMemoryClaimRedis(),
  drain = new ShutdownDrain(),
}: MakeGatewayOptions = {}) {
  const config = {
    get: vi.fn(() => 2),
  } as unknown as ConfigService<EnvConfig, true>;
  return new AgentGateway(
    { execute: vi.fn(), ...handler } as unknown as RunAgentTurnHandler,
    { execute: vi.fn(), ...approve } as unknown as ApproveMutationHandler,
    { execute: vi.fn(), ...reject } as unknown as RejectMutationHandler,
    new TurnClaimService(redis.provider, config),
    jwt as unknown as JwtService,
    (featureFlags ?? {
      isEnabled: vi.fn().mockResolvedValue(true),
    }) as unknown as FeatureFlagsService,
    drain,
    config
  );
}

const PROPOSAL_TURN = '66666666-6666-4666-8666-666666666666';

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

  it('emits agent:turn_settled when the handler finds the turn already stored', async () => {
    const execute = vi.fn(
      async (_input: unknown, cb: { onTurnSettled?: (id: string) => void }) => {
        cb.onTurnSettled?.('conv-9');
      }
    );
    const gateway = makeGateway({
      handler: { execute } as Partial<RunAgentTurnHandler>,
    });
    const client = makeClient('u1');
    const turnId = '99999999-9999-4999-8999-999999999999';

    await gateway.handleMessage(client as never, {
      turnId,
      message: { content: 'hi' },
    });

    expect(client.emit).toHaveBeenCalledWith('agent:turn_settled', {
      turnId,
      conversationId: 'conv-9',
    });
  });

  it('forwards the client IP to the turn handler', async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    const gateway = makeGateway({ handler: { execute } });
    const client = makeClient('u1');
    (client.data as Record<string, unknown>)['clientIp'] = '203.0.113.7';

    await gateway.handleMessage(client as never, {
      message: { content: 'hi' },
    });

    expect(execute.mock.calls[0][0]).toMatchObject({
      clientIp: '203.0.113.7',
    });
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

    await gateway.handleMessage(client as never, {
      message: { content: '' },
    });

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

  it('forwards a valid effort to the turn handler', async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    const gateway = makeGateway({ handler: { execute } });
    const client = makeClient('u1');

    await gateway.handleMessage(client as never, {
      message: { content: 'hi' },
      effort: 'max',
    });

    expect(execute.mock.calls[0][0]).toMatchObject({ effort: 'max' });
  });

  it('omits effort from the handler input when the payload carries none', async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    const gateway = makeGateway({ handler: { execute } });
    const client = makeClient('u1');

    await gateway.handleMessage(client as never, {
      message: { content: 'hi' },
    });

    expect(execute.mock.calls[0][0]).not.toHaveProperty('effort');
  });

  it('rejects an unknown effort level with VALIDATION_ERROR', async () => {
    const execute = vi.fn();
    const gateway = makeGateway({ handler: { execute } });
    const client = makeClient('u1');

    await gateway.handleMessage(client as never, {
      message: { content: 'hi' },
      effort: 'ultra',
    });

    expect(client.emit).toHaveBeenCalledWith(
      'agent:error',
      expect.objectContaining({ code: 'VALIDATION_ERROR' })
    );
    expect(execute).not.toHaveBeenCalled();
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
          stopReason: 'completed',
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
      expect.objectContaining({
        conversationId: 'conv-9',
        stopReason: 'completed',
      })
    );
  });

  it('emits the model resolution on agent:done', async () => {
    const modelResolution = {
      requested: null,
      resolved: 'anthropic:claude-sonnet-5',
    };
    const execute = vi.fn(
      async (_input: unknown, cb: { onDone: (usage: unknown) => void }) => {
        cb.onDone({
          inputTokens: 1,
          outputTokens: 1,
          model: 'anthropic:claude-sonnet-5',
          costUsd: 0,
          sources: [],
          knownNotes: [],
          stopReason: 'completed',
          modelResolution,
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
      expect.objectContaining({ modelResolution })
    );
  });

  it('emits agent:conversation when the handler announces a created conversation', async () => {
    const execute = vi.fn(
      async (
        _input: unknown,
        cb: { onConversation?: (conversationId: string) => void }
      ): Promise<void> => {
        cb.onConversation?.('conv-9');
      }
    );
    const gateway = makeGateway({
      handler: { execute } as Partial<RunAgentTurnHandler>,
    });
    const client = makeClient('u1');

    await gateway.handleMessage(client as never, {
      message: { content: 'hi' },
    });

    expect(client.emit).toHaveBeenCalledWith('agent:conversation', {
      conversationId: 'conv-9',
      turnId: expect.any(String),
    });
  });

  it.each(Object.values(AGENT_STOP_REASON))(
    'forwards stopReason %s on agent:done',
    async (stopReason) => {
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
            stopReason,
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
        expect.objectContaining({ stopReason })
      );
    }
  );

  it.each([true, false])(
    'forwards continuable %s on agent:done',
    async (continuable) => {
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
            webSources: [],
            stopReason: 'max_steps',
            continuable,
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
        expect.objectContaining({ stopReason: 'max_steps', continuable })
      );
    }
  );

  it('emits agent:thinking when the handler streams reasoning', async () => {
    const execute = vi.fn(
      async (
        _input: unknown,
        cb: { onThinking?: (text: string) => void }
      ): Promise<void> => {
        cb.onThinking?.('weighing the options');
      }
    );
    const gateway = makeGateway({
      handler: { execute } as Partial<RunAgentTurnHandler>,
    });
    const client = makeClient('u1');

    await gateway.handleMessage(client as never, {
      message: { content: 'hi' },
    });

    expect(client.emit).toHaveBeenCalledWith('agent:thinking', {
      text: 'weighing the options',
      turnId: expect.any(String),
    });
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

  it('cancel aborts the slot with the cancelled reason', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let signal: AbortSignal | undefined;
    const execute = vi.fn(
      async (_input: unknown, _cb: unknown, sig: AbortSignal) => {
        signal = sig;
        await gate;
      }
    );
    const gateway = makeGateway({
      handler: { execute } as Partial<RunAgentTurnHandler>,
    });
    const client = makeClient('u1');

    const turn = gateway.handleMessage(client as never, {
      message: { content: 'hi' },
    });
    await flushAsync();

    gateway.handleCancel(client as never);

    expect(signal?.reason).toBe(TURN_ABORT_REASON.CANCELLED);

    release();
    await turn;
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

  it('disconnect aborts the slot with the disconnected reason', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let signal: AbortSignal | undefined;
    const execute = vi.fn(
      async (_input: unknown, _cb: unknown, sig: AbortSignal) => {
        signal = sig;
        await gate;
      }
    );
    const gateway = makeGateway({
      handler: { execute } as Partial<RunAgentTurnHandler>,
    });
    const client = makeClient('u1');

    const turn = gateway.handleMessage(client as never, {
      message: { content: 'hi' },
    });
    await flushAsync();

    gateway.handleDisconnect(client as never);

    expect(signal?.reason).toBe(TURN_ABORT_REASON.DISCONNECTED);

    release();
    await turn;
  });

  it('drains: aborts running turns as a shutdown and waits for them to settle', async () => {
    let settled = false;
    const execute = vi.fn(
      async (_input: unknown, _cb: unknown, signal: AbortSignal) => {
        await new Promise<void>((resolve) =>
          signal.addEventListener('abort', () => resolve())
        );
        await flushAsync();
        settled = true;
      }
    );
    const drain = new ShutdownDrain();
    const gateway = makeGateway({
      handler: { execute } as Partial<RunAgentTurnHandler>,
      drain,
    });
    const client = makeClient('u1');

    const running = gateway.handleMessage(client as never, {
      message: { content: 'hi' },
    });
    await flushAsync();
    await drain.beforeApplicationShutdown();

    expect(settled).toBe(true);
    await running;
    expect((execute.mock.calls[0][2] as AbortSignal).reason).toBe(
      SHUTDOWN_ABORT_REASON
    );
  });

  it('refuses a turn that arrives while draining', async () => {
    const execute = vi.fn();
    const drain = new ShutdownDrain();
    const gateway = makeGateway({
      handler: { execute } as Partial<RunAgentTurnHandler>,
      drain,
    });
    await drain.beforeApplicationShutdown();
    const client = makeClient('u1');

    await gateway.handleMessage(client as never, {
      message: { content: 'hi' },
    });

    expect(execute).not.toHaveBeenCalled();
    expect(client.emit).toHaveBeenCalledWith(
      'agent:error',
      expect.objectContaining({ code: 'TURN_CLAIM_UNAVAILABLE' })
    );
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
        conversationId: 'conv-1',
        turnId: PROPOSAL_TURN,
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
      resume: { outcome: 'created the note "GTD"' },
    });
  });

  it('resumed turns keep the anonymous budget and client IP of the session', async () => {
    const approveExecute = vi.fn().mockResolvedValue(
      ok({
        result: { noteId: 'n1', title: 'GTD', kind: 'create' },
        outcome: 'created the note "GTD"',
        conversationId: 'conv-1',
        turnId: PROPOSAL_TURN,
      })
    );
    const resumeTurn = vi.fn().mockResolvedValue(undefined);
    const gateway = makeGateway({
      approve: { execute: approveExecute },
      handler: { resumeTurn } as Partial<RunAgentTurnHandler>,
    });
    const client = makeClient('u1');
    (client.data as Record<string, unknown>)['isAnonymous'] = true;
    (client.data as Record<string, unknown>)['clientIp'] = '203.0.113.7';

    await gateway.handleApprove(client as never, approvePayload());

    expect(resumeTurn.mock.calls[0][0]).toMatchObject({
      isAnonymous: true,
      clientIp: '203.0.113.7',
    });
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
        conversationId: 'conv-1',
        turnId: PROPOSAL_TURN,
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

  describe('while the server drains', () => {
    const PROPOSAL_ID = 'd4816ca2-7965-46ea-b828-3ecfe32428be';
    const DRAINED_TURN = '88888888-8888-4888-8888-888888888888';

    function untilAborted(signal: AbortSignal): Promise<void> {
      return new Promise<void>((resolve) =>
        signal.addEventListener('abort', () => resolve(), { once: true })
      );
    }

    function turnErrors(client: ReturnType<typeof makeClient>) {
      return client.emit.mock.calls.filter(
        ([event]) => event === 'agent:error'
      );
    }

    it('tells the client to resend a message turn it aborted mid-run', async () => {
      const execute = vi.fn(
        async (_input: unknown, _cb: unknown, signal: AbortSignal) => {
          await untilAborted(signal);
        }
      );
      const drain = new ShutdownDrain();
      const gateway = makeGateway({
        handler: { execute } as Partial<RunAgentTurnHandler>,
        drain,
      });
      const client = makeClient('u1');

      const running = gateway.handleMessage(client as never, {
        turnId: DRAINED_TURN,
        message: { content: 'hi' },
      });
      await vi.waitFor(() => expect(execute).toHaveBeenCalled());
      await drain.beforeApplicationShutdown();
      await running;

      expect(turnErrors(client)).toEqual([
        [
          'agent:error',
          expect.objectContaining({
            code: 'TURN_CLAIM_UNAVAILABLE',
            turnId: DRAINED_TURN,
          }),
        ],
      ]);
    });

    it('tells the client a resume it aborted mid-run under the turn id', async () => {
      const approveExecute = vi.fn().mockResolvedValue(
        ok({
          result: { noteId: 'n1', title: 'GTD', kind: 'create' },
          outcome: 'created the note "GTD"',
          conversationId: 'conv-1',
          turnId: PROPOSAL_TURN,
        })
      );
      const resumeTurn = vi.fn(
        async (_input: unknown, _cb: unknown, signal: AbortSignal) => {
          await untilAborted(signal);
        }
      );
      const drain = new ShutdownDrain();
      const gateway = makeGateway({
        approve: { execute: approveExecute },
        handler: { resumeTurn } as Partial<RunAgentTurnHandler>,
        drain,
      });
      const client = makeClient('u1');

      const approving = gateway.handleApprove(
        client as never,
        approvePayload()
      );
      await vi.waitFor(() => expect(resumeTurn).toHaveBeenCalled());
      await drain.beforeApplicationShutdown();
      await approving;

      expect(turnErrors(client)).toEqual([
        [
          'agent:error',
          expect.objectContaining({
            code: 'TURN_CLAIM_UNAVAILABLE',
            turnId: PROPOSAL_TURN,
          }),
        ],
      ]);
    });

    it('keeps a turn the user cancelled silent', async () => {
      const execute = vi.fn(
        async (_input: unknown, _cb: unknown, signal: AbortSignal) => {
          await untilAborted(signal);
        }
      );
      const gateway = makeGateway({
        handler: { execute } as Partial<RunAgentTurnHandler>,
      });
      const client = makeClient('u1');

      const running = gateway.handleMessage(client as never, {
        turnId: DRAINED_TURN,
        message: { content: 'hi' },
      });
      await vi.waitFor(() => expect(execute).toHaveBeenCalled());
      gateway.handleCancel(client as never);
      await running;

      expect(turnErrors(client)).toEqual([]);
    });

    it('never follows a proposal it already sent with the notice', async () => {
      const proposal = ProposedMutation.create({
        id: PROPOSAL_ID,
        kind: 'create',
        payload: { title: 'GTD', contentHtml: '<p>GTD</p>' },
        summary: 'Create "GTD"',
      })._unsafeUnwrap();
      const execute = vi.fn(
        async (
          _input: unknown,
          cb: RunAgentTurnCallbacks,
          signal: AbortSignal
        ) => {
          cb.onProposal(proposal);
          await untilAborted(signal);
        }
      );
      const drain = new ShutdownDrain();
      const gateway = makeGateway({
        handler: { execute } as Partial<RunAgentTurnHandler>,
        drain,
      });
      const client = makeClient('u1');

      const running = gateway.handleMessage(client as never, {
        turnId: DRAINED_TURN,
        message: { content: 'create a note' },
      });
      await vi.waitFor(() => expect(execute).toHaveBeenCalled());
      await drain.beforeApplicationShutdown();
      await running;

      expect(turnErrors(client)).toEqual([]);
    });

    it.each([
      [
        'an error',
        (cb: RunAgentTurnCallbacks) =>
          cb.onError({ code: 'AI_PROVIDER_ERROR', message: 'boom' }),
        [
          [
            'agent:error',
            {
              code: 'AI_PROVIDER_ERROR',
              message: 'boom',
              turnId: DRAINED_TURN,
            },
          ],
        ],
      ],
      [
        'a done',
        (cb: RunAgentTurnCallbacks) =>
          cb.onDone({
            inputTokens: 1,
            outputTokens: 1,
            model: 'm',
            costUsd: 0,
            sources: [],
            knownNotes: [],
            webSources: [],
            stopReason: 'completed',
            continuable: false,
          }),
        [],
      ],
      [
        'a turn_settled',
        (cb: RunAgentTurnCallbacks) => cb.onTurnSettled?.('conv-9'),
        [],
      ],
    ] as const)(
      'never follows %s it already sent with the notice',
      async (_ending, end, errors) => {
        const execute = vi.fn(
          async (
            _input: unknown,
            cb: RunAgentTurnCallbacks,
            signal: AbortSignal
          ) => {
            end(cb);
            await untilAborted(signal);
          }
        );
        const drain = new ShutdownDrain();
        const gateway = makeGateway({
          handler: { execute } as Partial<RunAgentTurnHandler>,
          drain,
        });
        const client = makeClient('u1');

        const running = gateway.handleMessage(client as never, {
          turnId: DRAINED_TURN,
          message: { content: 'hi' },
        });
        await vi.waitFor(() => expect(execute).toHaveBeenCalled());
        await drain.beforeApplicationShutdown();
        await running;

        expect(turnErrors(client)).toEqual(errors);
      }
    );

    function pendingProposals() {
      const mutation = ProposedMutation.create({
        id: PROPOSAL_ID,
        kind: 'create',
        payload: { title: 'GTD', contentHtml: '<p>GTD</p>' },
        summary: 'Create "GTD"',
      })._unsafeUnwrap();
      const records = new Map<string, PendingMutationRecord>([
        [
          PROPOSAL_ID,
          {
            userId: 'u1',
            turnId: PROPOSAL_TURN,
            conversationId: 'conv-1',
            mutation,
          },
        ],
      ]);
      const store: PendingMutationStore = {
        save: async (record) => {
          records.set(record.mutation.id, record);
        },
        take: async (proposalId, userId) => {
          const record = records.get(proposalId);
          records.delete(proposalId);
          return record?.userId === userId ? record : null;
        },
      };
      return { records, store };
    }

    it('refuses an approve before taking its proposal, so the proposal survives', async () => {
      const { records, store } = pendingProposals();
      const handler = new ApproveMutationHandler(
        store,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never
      );
      const drain = new ShutdownDrain();
      const gateway = makeGateway({
        approve: { execute: (input) => handler.execute(input) },
        drain,
      });
      await drain.beforeApplicationShutdown();
      const client = makeClient('u1');

      await gateway.handleApprove(client as never, approvePayload(PROPOSAL_ID));

      expect(records.has(PROPOSAL_ID)).toBe(true);
      expect(client.emit).toHaveBeenCalledWith('agent:error', {
        code: 'TURN_CLAIM_UNAVAILABLE',
        message: expect.any(String),
      });
    });

    it('refuses a reject before taking its proposal, so the proposal survives', async () => {
      const { records, store } = pendingProposals();
      const handler = new RejectMutationHandler(store);
      const drain = new ShutdownDrain();
      const gateway = makeGateway({
        reject: { execute: (input) => handler.execute(input) },
        drain,
      });
      await drain.beforeApplicationShutdown();
      const client = makeClient('u1');

      await gateway.handleReject(client as never, approvePayload(PROPOSAL_ID));

      expect(records.has(PROPOSAL_ID)).toBe(true);
      expect(client.emit).toHaveBeenCalledWith('agent:error', {
        code: 'TURN_CLAIM_UNAVAILABLE',
        message: expect.any(String),
      });
    });

    it('waits for an approve already committing, then refuses its resume under the turn id', async () => {
      const order: string[] = [];
      let finishCommit!: () => void;
      const approveExecute = vi.fn(
        () =>
          new Promise((resolve) => {
            finishCommit = () => {
              order.push('committed');
              resolve(
                ok({
                  result: { noteId: 'n1', title: 'GTD', kind: 'create' },
                  outcome: 'created the note "GTD"',
                  conversationId: 'conv-1',
                  turnId: PROPOSAL_TURN,
                })
              );
            };
          })
      );
      const resumeTurn = vi.fn();
      const drain = new ShutdownDrain();
      const gateway = makeGateway({
        approve: { execute: approveExecute } as Partial<ApproveMutationHandler>,
        handler: { resumeTurn } as Partial<RunAgentTurnHandler>,
        drain,
      });
      const client = makeClient('u1');

      const approving = gateway.handleApprove(
        client as never,
        approvePayload()
      );
      await vi.waitFor(() => expect(approveExecute).toHaveBeenCalled());
      const draining = drain.beforeApplicationShutdown().then(() => {
        order.push('drained');
      });
      await flushAsync();
      finishCommit();
      await Promise.all([draining, approving]);

      expect(order).toEqual(['committed', 'drained']);
      expect(client.emit).toHaveBeenCalledWith(
        'agent:committed',
        expect.objectContaining({ turnId: PROPOSAL_TURN })
      );
      expect(resumeTurn).not.toHaveBeenCalled();
      expect(client.emit).toHaveBeenCalledWith(
        'agent:error',
        expect.objectContaining({
          code: 'TURN_CLAIM_UNAVAILABLE',
          turnId: PROPOSAL_TURN,
        })
      );
    });
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
  describe('delivery acknowledgements', () => {
    it('acknowledges agent:message on receipt, before the turn ends', async () => {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const execute = vi.fn(async () => {
        await gate;
      });
      const gateway = makeGateway({
        handler: { execute } as Partial<RunAgentTurnHandler>,
      });
      const client = makeClient('user-1');
      const ack = vi.fn();

      const turn = gateway.handleMessage(
        client as never,
        { message: { content: 'hi' } },
        ack
      );
      await flushAsync();

      expect(ack).toHaveBeenCalledTimes(1);
      expect(execute).toHaveBeenCalledTimes(1);

      release();
      await turn;
      expect(ack).toHaveBeenCalledTimes(1);
    });

    it('acknowledges a refused agent:message too, so the client does not fail it as undelivered', async () => {
      const gateway = makeGateway();
      const client = makeClient();
      const ack = vi.fn();

      await gateway.handleMessage(
        client as never,
        { message: { content: 'hi' } },
        ack
      );

      expect(ack).toHaveBeenCalledTimes(1);
      expect(client.emit).toHaveBeenCalledWith(
        'agent:error',
        expect.objectContaining({ code: 'AUTH_REQUIRED' })
      );
    });

    it('hands every handler the ack callback, so Nest never acknowledges with a return value', () => {
      const handlers = new GatewayMetadataExplorer(
        new MetadataScanner()
      ).explore(makeGateway());

      const acked = handlers
        .map((handler) => [handler.message, handler.isAckHandledManually])
        .sort();

      expect(acked).toEqual([
        ['agent:approve', true],
        ['agent:cancel', true],
        ['agent:message', true],
        ['agent:reject', true],
      ]);
    });

    it('acknowledges agent:cancel, agent:approve and agent:reject on receipt', async () => {
      const gateway = makeGateway();
      const client = makeClient('user-1');
      const acks = [vi.fn(), vi.fn(), vi.fn()];

      gateway.handleCancel(client as never, acks[0]);
      await gateway.handleApprove(client as never, {}, acks[1]);
      await gateway.handleReject(client as never, {}, acks[2]);

      for (const ack of acks) {
        expect(ack).toHaveBeenCalledTimes(1);
      }
    });
  });

  describe('a client gone before its turn slot is taken', () => {
    const resumable = {
      outcome: 'resumed',
      conversationId: 'conv-1',
      turnId: PROPOSAL_TURN,
    };
    const committed = { noteId: 'n1', title: 'GTD', kind: 'create' } as const;

    function setup({
      disconnectDuringFlagCheck,
    }: {
      disconnectDuringFlagCheck: boolean;
    }) {
      const client = makeClient('u1');
      const turn = {
        execute: vi.fn().mockResolvedValue(undefined),
        resumeTurn: vi.fn().mockResolvedValue(undefined),
      };
      const gateway = makeGateway({
        handler: turn as Partial<RunAgentTurnHandler>,
        approve: {
          execute: vi
            .fn()
            .mockResolvedValue(ok({ result: committed, ...resumable })),
        },
        reject: { execute: vi.fn().mockResolvedValue(ok(resumable)) },
        featureFlags: {
          isEnabled: vi.fn(async () => {
            if (disconnectDuringFlagCheck) {
              client.connected = false;
            }
            return true;
          }),
        },
      });
      return { gateway, client, turn };
    }

    type Harness = ReturnType<typeof setup>;

    const turnStarts = [
      {
        request: 'a message',
        send: ({ gateway, client }: Harness) =>
          gateway.handleMessage(client as never, {
            message: { content: 'hi' },
          }),
        started: ({ turn }: Harness) => turn.execute,
      },
      {
        request: 'an approval',
        send: ({ gateway, client }: Harness) =>
          gateway.handleApprove(client as never, approvePayload()),
        started: ({ turn }: Harness) => turn.resumeTurn,
      },
      {
        request: 'a rejection',
        send: ({ gateway, client }: Harness) =>
          gateway.handleReject(client as never, approvePayload()),
        started: ({ turn }: Harness) => turn.resumeTurn,
      },
    ];

    it.each(turnStarts)(
      'never starts a turn from $request when its client disconnects during the flag check',
      async ({ send, started }) => {
        const harness = setup({ disconnectDuringFlagCheck: true });

        await send(harness);

        expect(started(harness)).not.toHaveBeenCalled();
      }
    );

    it.each(turnStarts)(
      'starts a turn from $request while its client stays connected',
      async ({ send, started }) => {
        const harness = setup({ disconnectDuringFlagCheck: false });

        await send(harness);

        expect(started(harness)).toHaveBeenCalledTimes(1);
      }
    );

    it('never resumes the turn of an approval whose client disconnects while it commits', async () => {
      const client = makeClient('u1');
      const resumeTurn = vi.fn().mockResolvedValue(undefined);
      const approveExecute = vi.fn(async () => {
        client.connected = false;
        return ok({ result: committed, ...resumable });
      });
      const gateway = makeGateway({
        approve: { execute: approveExecute },
        handler: { resumeTurn } as Partial<RunAgentTurnHandler>,
      });

      await gateway.handleApprove(client as never, approvePayload());

      expect(approveExecute).toHaveBeenCalledTimes(1);
      expect(resumeTurn).not.toHaveBeenCalled();
    });
  });

  describe('turn identity', () => {
    const TURN = '55555555-5555-4555-8555-555555555555';
    const CONVERSATION = '11111111-1111-4111-8111-111111111111';
    const UUID_PATTERN =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    const turn = (over: Record<string, unknown> = {}) => ({
      turnId: TURN,
      conversationId: CONVERSATION,
      message: { content: 'hi' },
      ...over,
    });
    const doneUsage = {
      inputTokens: 1,
      outputTokens: 1,
      model: 'm',
      costUsd: 0,
      sources: [],
      knownNotes: [],
      webSources: [],
      stopReason: 'completed' as const,
      continuable: false,
    };

    type Execute = (
      input: { turnId: string },
      callbacks: RunAgentTurnCallbacks,
      signal: AbortSignal
    ) => Promise<void>;

    const completes: Execute = async (_input, cb) => {
      cb.onModelStart?.();
      cb.onChunk('Hi');
      cb.onDone(doneUsage);
    };

    function claimOf(redis: InMemoryClaimRedis, turnId = TURN) {
      const entry = redis.entries.get(`agent:turn:u1:${turnId}`);
      return entry ? (JSON.parse(entry.value) as { status: string }) : null;
    }

    function turnErrors(client: ReturnType<typeof makeClient>) {
      return client.emit.mock.calls
        .filter(([event]) => event === 'agent:error')
        .map(([, payload]) => payload as { code: string; turnId?: string });
    }

    function heldTurns() {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const execute = vi.fn<Execute>(async (_input, cb) => {
        cb.onModelStart?.();
        await gate;
      });
      return { execute, release };
    }

    it('hands the client turn id to the handler and echoes it on every turn event', async () => {
      const proposal = ProposedMutation.create({
        id: '77777777-7777-4777-8777-777777777777',
        kind: 'create',
        payload: { title: 'GTD', contentHtml: '<p>x</p>' },
        summary: 'Create GTD',
      })._unsafeUnwrap();
      const execute = vi.fn<Execute>(async (_input, cb) => {
        cb.onModelStart?.();
        cb.onConversation?.(CONVERSATION);
        cb.onThinking?.('hmm');
        cb.onChunk('Hi');
        cb.onProposal(proposal);
        cb.onDone(doneUsage);
        cb.onError({ code: 'AI_PROVIDER_ERROR', message: 'boom' });
      });
      const gateway = makeGateway({ handler: { execute } as never });
      const client = makeClient('u1');

      await gateway.handleMessage(client as never, turn());

      expect(execute.mock.calls[0][0]).toMatchObject({ turnId: TURN });
      const events = client.emit.mock.calls.map(([event]) => event);
      expect(events).toEqual([
        'agent:conversation',
        'agent:thinking',
        'agent:chunk',
        'agent:proposal',
        'agent:done',
        'agent:error',
      ]);
      for (const [, payload] of client.emit.mock.calls) {
        expect(payload).toMatchObject({ turnId: TURN });
      }
    });

    it('resumes an approved proposal under the turn that proposed it, and echoes that id', async () => {
      const resumeTurn = vi.fn<Execute>(async (_input, cb) => {
        cb.onChunk('done');
      });
      const gateway = makeGateway({
        approve: {
          execute: vi.fn().mockResolvedValue(
            ok({
              result: { noteId: 'n1', title: 'GTD', kind: 'create' },
              outcome: 'created the note "GTD"',
              conversationId: 'conv-1',
              turnId: PROPOSAL_TURN,
            })
          ),
        },
        handler: { resumeTurn } as never,
      });
      const client = makeClient('u1');

      await gateway.handleApprove(client as never, approvePayload());

      expect(resumeTurn.mock.calls[0][0]).toMatchObject({
        turnId: PROPOSAL_TURN,
      });
      expect(client.emit).toHaveBeenCalledWith(
        'agent:committed',
        expect.objectContaining({ turnId: PROPOSAL_TURN })
      );
      expect(client.emit).toHaveBeenCalledWith('agent:chunk', {
        text: 'done',
        turnId: PROPOSAL_TURN,
      });
    });

    it("echoes the proposal's turn id on an approve that fails to commit", async () => {
      const gateway = makeGateway({
        approve: {
          execute: vi.fn().mockResolvedValue(
            err({
              code: 'AGENT_COMMIT_FAILED',
              message: 'Could not apply the change',
              turnId: PROPOSAL_TURN,
            })
          ),
        },
      });
      const client = makeClient('u1');

      await gateway.handleApprove(client as never, approvePayload());

      expect(client.emit.mock.calls).toEqual([
        [
          'agent:error',
          {
            code: 'AGENT_COMMIT_FAILED',
            message: 'Could not apply the change',
            turnId: PROPOSAL_TURN,
          },
        ],
      ]);
    });

    it('mints a turn id for a payload without one, runs it and claims nothing', async () => {
      const redis = createInMemoryClaimRedis();
      const execute = vi.fn<Execute>(completes);
      const gateway = makeGateway({ handler: { execute } as never, redis });
      const client = makeClient('u1');

      await gateway.handleMessage(client as never, {
        message: { content: 'hi' },
      });

      expect(execute).toHaveBeenCalledOnce();
      const minted = execute.mock.calls[0][0].turnId;
      expect(minted).toMatch(UUID_PATTERN);
      expect(client.emit).toHaveBeenCalledWith('agent:chunk', {
        text: 'Hi',
        turnId: minted,
      });
      expect(redis.entries.size).toBe(0);
    });

    it('rejects a turn id that is not a uuid', async () => {
      const execute = vi.fn();
      const gateway = makeGateway({ handler: { execute } });
      const client = makeClient('u1');

      await gateway.handleMessage(
        client as never,
        turn({ turnId: 'not-a-uuid' })
      );

      expect(turnErrors(client)).toEqual([
        expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      ]);
      expect(execute).not.toHaveBeenCalled();
    });

    it('answers a duplicate of a running turn with TURN_IN_PROGRESS and never runs it twice', async () => {
      const { execute, release } = heldTurns();
      const gateway = makeGateway({ handler: { execute } as never });
      const client = makeClient('u1');

      const first = gateway.handleMessage(client as never, turn());
      await flushAsync();
      const resent = makeClient('u1', 'c2');
      await gateway.handleMessage(resent as never, turn());

      expect(turnErrors(resent)).toEqual([
        expect.objectContaining({ code: 'TURN_IN_PROGRESS', turnId: TURN }),
      ]);
      expect(execute).toHaveBeenCalledOnce();
      release();
      await first;
    });

    it('resumes an approved proposal while the turn that proposed it still holds its slot', async () => {
      const held = heldTurns();
      const resumeTurn = vi.fn<Execute>(async (_input, cb) => {
        cb.onChunk('done');
      });
      const gateway = makeGateway({
        handler: { execute: held.execute, resumeTurn } as never,
        approve: {
          execute: vi.fn().mockResolvedValue(
            ok({
              result: { noteId: 'n1', title: 'GTD', kind: 'create' },
              outcome: 'created the note "GTD"',
              conversationId: CONVERSATION,
              turnId: TURN,
            })
          ),
        },
      });
      const client = makeClient('u1');

      const proposing = gateway.handleMessage(client as never, turn());
      await flushAsync();
      await gateway.handleApprove(client as never, approvePayload());

      expect(turnErrors(client)).toEqual([]);
      expect(resumeTurn).toHaveBeenCalledOnce();
      held.release();
      await proposing;
    });

    it("never refuses a turn because another user's turn holds the same id", async () => {
      const { execute, release } = heldTurns();
      const gateway = makeGateway({ handler: { execute } as never });

      const first = gateway.handleMessage(makeClient('u1') as never, turn());
      await flushAsync();
      const otherUser = makeClient('u2', 'c2');
      const second = gateway.handleMessage(otherUser as never, turn());
      await flushAsync();

      expect(turnErrors(otherUser)).toEqual([]);
      expect(execute).toHaveBeenCalledTimes(2);
      release();
      await Promise.all([first, second]);
    });

    it('answers a duplicate running on another API instance with TURN_IN_PROGRESS', async () => {
      const redis = createInMemoryClaimRedis();
      const { execute, release } = heldTurns();
      const instanceA = makeGateway({ handler: { execute } as never, redis });
      const instanceB = makeGateway({ handler: { execute } as never, redis });

      const first = instanceA.handleMessage(makeClient('u1') as never, turn());
      await flushAsync();
      const resent = makeClient('u1', 'c2');
      await instanceB.handleMessage(resent as never, turn());

      expect(turnErrors(resent)).toEqual([
        expect.objectContaining({ code: 'TURN_IN_PROGRESS', turnId: TURN }),
      ]);
      expect(execute).toHaveBeenCalledOnce();
      release();
      await first;
    });

    it('answers a duplicate of a settled turn with agent:turn_settled and never runs it twice', async () => {
      const execute = vi.fn<Execute>(completes);
      const gateway = makeGateway({ handler: { execute } as never });
      await gateway.handleMessage(makeClient('u1') as never, turn());
      const resent = makeClient('u1', 'c2');

      await gateway.handleMessage(resent as never, turn());

      expect(resent.emit.mock.calls).toEqual([
        ['agent:turn_settled', { turnId: TURN, conversationId: CONVERSATION }],
      ]);
      expect(execute).toHaveBeenCalledOnce();
    });

    it('opens a new conversation under the id derived from the user and the turn', async () => {
      const execute = vi.fn<Execute>(completes);
      const gateway = makeGateway({ handler: { execute } as never });
      const payload = turn({ conversationId: undefined });
      await gateway.handleMessage(makeClient('u1') as never, payload);
      const resent = makeClient('u1', 'c2');

      await gateway.handleMessage(resent as never, payload);

      expect(execute.mock.calls[0][0]).not.toHaveProperty('conversationId');
      expect(resent.emit).toHaveBeenCalledWith('agent:turn_settled', {
        turnId: TURN,
        conversationId: uuidv5(`u1:${TURN}`, KNOWTIS_CONVERSATION_NAMESPACE),
      });
    });

    describe('a resend that names the conversation its turn opened, as the client learns it from agent:conversation', () => {
      const opened = uuidv5(`u1:${TURN}`, KNOWTIS_CONVERSATION_NAMESPACE);

      it('is the same turn once settled', async () => {
        const execute = vi.fn<Execute>(completes);
        const gateway = makeGateway({ handler: { execute } as never });
        await gateway.handleMessage(
          makeClient('u1') as never,
          turn({ conversationId: undefined })
        );
        const resent = makeClient('u1', 'c2');

        await gateway.handleMessage(
          resent as never,
          turn({ conversationId: opened })
        );

        expect(resent.emit.mock.calls).toEqual([
          ['agent:turn_settled', { turnId: TURN, conversationId: opened }],
        ]);
        expect(execute).toHaveBeenCalledOnce();
      });

      it('is the same turn while it runs on another API instance', async () => {
        const redis = createInMemoryClaimRedis();
        const { execute, release } = heldTurns();
        const instanceA = makeGateway({ handler: { execute } as never, redis });
        const instanceB = makeGateway({ handler: { execute } as never, redis });

        const first = instanceA.handleMessage(
          makeClient('u1') as never,
          turn({ conversationId: undefined })
        );
        await flushAsync();
        const resent = makeClient('u1', 'c2');
        await instanceB.handleMessage(
          resent as never,
          turn({ conversationId: opened })
        );

        expect(turnErrors(resent)).toEqual([
          expect.objectContaining({ code: 'TURN_IN_PROGRESS', turnId: TURN }),
        ]);
        expect(execute).toHaveBeenCalledOnce();
        release();
        await first;
      });
    });

    it.each([
      ['message', { message: { content: 'something else' } }],
      ['note', { noteId: '88888888-8888-4888-8888-888888888888' }],
      ['conversation', { conversationId: undefined }],
    ])(
      'answers a turn id reused for another %s with TURN_ID_REUSED and never runs it',
      async (_field, change) => {
        const execute = vi.fn<Execute>(completes);
        const gateway = makeGateway({ handler: { execute } as never });
        await gateway.handleMessage(makeClient('u1') as never, turn());
        const reused = makeClient('u1', 'c2');

        await gateway.handleMessage(reused as never, turn(change));

        expect(turnErrors(reused)).toEqual([
          expect.objectContaining({ code: 'TURN_ID_REUSED', turnId: TURN }),
        ]);
        expect(execute).toHaveBeenCalledOnce();
      }
    );

    it('fails closed with TURN_CLAIM_UNAVAILABLE when Redis errors, and never runs the turn', async () => {
      const redis = createInMemoryClaimRedis();
      redis.client.set = () => Promise.reject(new Error('connection lost'));
      const execute = vi.fn<Execute>(completes);
      const gateway = makeGateway({ handler: { execute } as never, redis });
      const client = makeClient('u1');

      await gateway.handleMessage(client as never, turn());

      expect(turnErrors(client)).toEqual([
        expect.objectContaining({
          code: 'TURN_CLAIM_UNAVAILABLE',
          turnId: TURN,
        }),
      ]);
      expect(execute).not.toHaveBeenCalled();
    });

    it('gives the concurrency slot back when a duplicate is refused', async () => {
      const held = heldTurns();
      const execute = vi.fn<Execute>(async (input, cb, signal) =>
        input.turnId === TURN
          ? completes(input, cb, signal)
          : held.execute(input, cb, signal)
      );
      const gateway = makeGateway({ handler: { execute } as never });
      await gateway.handleMessage(makeClient('u1') as never, turn());
      for (const id of ['dup-1', 'dup-2', 'dup-3']) {
        await gateway.handleMessage(makeClient('u1', id) as never, turn());
      }

      const running = [
        gateway.handleMessage(makeClient('u1', 'a') as never, {
          message: { content: 'a' },
        }),
        gateway.handleMessage(makeClient('u1', 'b') as never, {
          message: { content: 'b' },
        }),
      ];
      await flushAsync();

      expect(held.execute).toHaveBeenCalledTimes(2);
      held.release();
      await Promise.all(running);
    });

    it.each([
      [
        'done',
        (async (_input, cb) => {
          cb.onModelStart?.();
          cb.onDone(doneUsage);
        }) as Execute,
      ],
      [
        'error',
        (async (_input, cb) => {
          cb.onModelStart?.();
          cb.onError({ code: 'AI_PROVIDER_ERROR', message: 'boom' });
        }) as Execute,
      ],
      [
        'a proposal',
        (async (_input, cb) => {
          cb.onModelStart?.();
          cb.onProposal(
            ProposedMutation.create({
              id: '77777777-7777-4777-8777-777777777777',
              kind: 'create',
              payload: { title: 'GTD', contentHtml: '<p>x</p>' },
              summary: 'Create GTD',
            })._unsafeUnwrap()
          );
        }) as Execute,
      ],
    ])(
      'settles the claim of a turn that ends in %s',
      async (_ending, execute) => {
        const redis = createInMemoryClaimRedis();
        const gateway = makeGateway({ handler: { execute } as never, redis });

        await gateway.handleMessage(makeClient('u1') as never, turn());

        expect(claimOf(redis)).toMatchObject({ status: 'settled' });
      }
    );

    it('settles the claim of a turn the client cancels after the model started', async () => {
      const redis = createInMemoryClaimRedis();
      const execute = vi.fn<Execute>(async (_input, cb, signal) => {
        cb.onModelStart?.();
        await new Promise<void>((resolve) =>
          signal.addEventListener('abort', () => resolve())
        );
      });
      const gateway = makeGateway({ handler: { execute } as never, redis });
      const client = makeClient('u1');

      const running = gateway.handleMessage(client as never, turn());
      await flushAsync();
      expect(claimOf(redis)).toMatchObject({ status: 'running' });
      gateway.handleCancel(client as never);
      await running;

      expect(claimOf(redis)).toMatchObject({ status: 'settled' });
    });

    it('settles the claim of a turn whose handler throws after the model started', async () => {
      const redis = createInMemoryClaimRedis();
      const execute = vi.fn<Execute>(async (_input, cb) => {
        cb.onModelStart?.();
        throw new Error('persistence exploded');
      });
      const gateway = makeGateway({ handler: { execute } as never, redis });

      await expect(
        gateway.handleMessage(makeClient('u1') as never, turn())
      ).rejects.toThrow('persistence exploded');

      expect(claimOf(redis)).toMatchObject({ status: 'settled' });
    });

    describe('a resend the conversation already stores, once its claim expired', () => {
      const alreadyStored: Execute = async (_input, cb) => {
        cb.onTurnSettled?.(CONVERSATION);
      };

      it('settles the claim for a day instead of releasing it', async () => {
        const redis = createInMemoryClaimRedis();
        const gateway = makeGateway({
          handler: { execute: vi.fn<Execute>(alreadyStored) } as never,
          redis,
        });

        await gateway.handleMessage(makeClient('u1') as never, turn());

        expect(claimOf(redis)).toMatchObject({ status: 'settled' });
        expect(redis.entries.get(`agent:turn:u1:${TURN}`)?.ttlSeconds).toBe(
          86_400
        );
      });

      it('answers a later resend from the claim, without asking the handler again', async () => {
        const execute = vi.fn<Execute>(alreadyStored);
        const gateway = makeGateway({ handler: { execute } as never });
        await gateway.handleMessage(makeClient('u1') as never, turn());
        const resent = makeClient('u1', 'c2');

        await gateway.handleMessage(resent as never, turn());

        expect(resent.emit.mock.calls).toEqual([
          [
            'agent:turn_settled',
            { turnId: TURN, conversationId: CONVERSATION },
          ],
        ]);
        expect(execute).toHaveBeenCalledOnce();
      });

      it('refuses a later resend of its turn id with another message as reused', async () => {
        const execute = vi.fn<Execute>(alreadyStored);
        const gateway = makeGateway({ handler: { execute } as never });
        await gateway.handleMessage(makeClient('u1') as never, turn());
        const reused = makeClient('u1', 'c2');

        await gateway.handleMessage(
          reused as never,
          turn({ message: { content: 'something else' } })
        );

        expect(turnErrors(reused)).toEqual([
          expect.objectContaining({ code: 'TURN_ID_REUSED', turnId: TURN }),
        ]);
        expect(execute).toHaveBeenCalledOnce();
      });
    });

    describe('a rejection before the model runs leaves the turn id free, so its replay runs', () => {
      it('an unauthenticated delivery', async () => {
        const execute = vi.fn<Execute>(completes);
        const gateway = makeGateway({ handler: { execute } as never });
        const anonymous = makeClient();

        await gateway.handleMessage(anonymous as never, turn());
        await gateway.handleMessage(makeClient('u1') as never, turn());

        expect(turnErrors(anonymous)).toEqual([
          expect.objectContaining({ code: 'AUTH_REQUIRED' }),
        ]);
        expect(execute).toHaveBeenCalledOnce();
      });

      it('a delivery while ai_enabled is off', async () => {
        const execute = vi.fn<Execute>(completes);
        const featureFlags = {
          isEnabled: vi
            .fn()
            .mockResolvedValueOnce(false)
            .mockResolvedValue(true),
        };
        const gateway = makeGateway({
          handler: { execute } as never,
          featureFlags,
        });
        const refused = makeClient('u1');

        await gateway.handleMessage(refused as never, turn());
        await gateway.handleMessage(makeClient('u1', 'c2') as never, turn());

        expect(turnErrors(refused)).toEqual([
          expect.objectContaining({ code: 'AI_FEATURE_DISABLED' }),
        ]);
        expect(execute).toHaveBeenCalledOnce();
      });

      it('a delivery past the concurrency cap', async () => {
        const held = heldTurns();
        const execute = vi.fn<Execute>(async (input, cb, signal) =>
          input.turnId === TURN
            ? completes(input, cb, signal)
            : held.execute(input, cb, signal)
        );
        const gateway = makeGateway({ handler: { execute } as never });
        const running = [
          gateway.handleMessage(makeClient('u1', 'a') as never, {
            message: { content: 'a' },
          }),
          gateway.handleMessage(makeClient('u1', 'b') as never, {
            message: { content: 'b' },
          }),
        ];
        await flushAsync();
        const refused = makeClient('u1', 'c');

        await gateway.handleMessage(refused as never, turn());
        held.release();
        await Promise.all(running);
        await gateway.handleMessage(makeClient('u1', 'd') as never, turn());

        expect(turnErrors(refused)).toEqual([
          expect.objectContaining({
            code: 'AI_RATE_LIMIT_EXCEEDED',
            turnId: TURN,
          }),
        ]);
        expect(
          execute.mock.calls.filter(([input]) => input.turnId === TURN)
        ).toHaveLength(1);
      });

      it('a turn whose handler throws before the model runs', async () => {
        const redis = createInMemoryClaimRedis();
        const execute = vi
          .fn<Execute>(completes)
          .mockRejectedValueOnce(new Error('database down'));
        const gateway = makeGateway({ handler: { execute } as never, redis });

        await expect(
          gateway.handleMessage(makeClient('u1') as never, turn())
        ).rejects.toThrow('database down');
        expect(claimOf(redis)).toBeNull();
        await gateway.handleMessage(makeClient('u1', 'c2') as never, turn());

        expect(execute).toHaveBeenCalledTimes(2);
        expect(claimOf(redis)).toMatchObject({ status: 'settled' });
      });

      it('a turn the client cancels before the model runs', async () => {
        const redis = createInMemoryClaimRedis();
        const execute = vi
          .fn<Execute>(completes)
          .mockImplementationOnce(
            (_input, _cb, signal) =>
              new Promise<void>((resolve) =>
                signal.addEventListener('abort', () => resolve())
              )
          );
        const gateway = makeGateway({ handler: { execute } as never, redis });
        const client = makeClient('u1');

        const cancelled = gateway.handleMessage(client as never, turn());
        await flushAsync();
        expect(claimOf(redis)).toMatchObject({ status: 'running' });
        gateway.handleCancel(client as never);
        await cancelled;
        expect(claimOf(redis)).toBeNull();
        await gateway.handleMessage(makeClient('u1', 'c2') as never, turn());

        expect(execute).toHaveBeenCalledTimes(2);
        expect(claimOf(redis)).toMatchObject({ status: 'settled' });
      });

      it('a turn the handler refuses before the model runs', async () => {
        const redis = createInMemoryClaimRedis();
        const execute = vi
          .fn<Execute>(completes)
          .mockImplementationOnce(async (_input, cb) => {
            cb.onError({ code: 'AI_RATE_LIMIT_EXCEEDED', message: 'limit' });
          });
        const gateway = makeGateway({ handler: { execute } as never, redis });
        const refused = makeClient('u1');

        await gateway.handleMessage(refused as never, turn());
        expect(claimOf(redis)).toBeNull();
        const replay = makeClient('u1', 'c2');
        await gateway.handleMessage(replay as never, turn());

        expect(turnErrors(refused)).toEqual([
          expect.objectContaining({
            code: 'AI_RATE_LIMIT_EXCEEDED',
            turnId: TURN,
          }),
        ]);
        expect(execute).toHaveBeenCalledTimes(2);
        expect(replay.emit).toHaveBeenCalledWith(
          'agent:done',
          expect.objectContaining({ turnId: TURN })
        );
        expect(claimOf(redis)).toMatchObject({ status: 'settled' });
      });
    });

    describe('a continue request', () => {
      const CONTINUED = '88888888-8888-4888-8888-888888888888';
      const NOTE = '99999999-9999-4999-8999-999999999999';
      const continueRequest = (over: Record<string, unknown> = {}) => ({
        turnId: TURN,
        conversationId: CONVERSATION,
        continuesTurnId: CONTINUED,
        ...over,
      });

      it('runs a continuation of the named turn instead of a message', async () => {
        const execute = vi.fn();
        const continueTurn = vi.fn<Execute>(completes);
        const gateway = makeGateway({
          handler: { execute, continueTurn } as never,
        });
        const client = makeClient('u1');
        Object.assign(client.data, { isAnonymous: true, clientIp: '10.0.0.1' });

        await gateway.handleMessage(
          client as never,
          continueRequest({ noteId: NOTE, model: 'm', effort: 'high' })
        );

        expect(execute).not.toHaveBeenCalled();
        expect(continueTurn).toHaveBeenCalledOnce();
        expect(continueTurn.mock.calls[0][0]).toEqual({
          userId: 'u1',
          turnId: TURN,
          conversationId: CONVERSATION,
          continuesTurnId: CONTINUED,
          isAnonymous: true,
          clientIp: '10.0.0.1',
          noteId: NOTE,
          model: 'm',
          effort: 'high',
        });
        expect(client.emit).toHaveBeenCalledWith(
          'agent:done',
          expect.objectContaining({ turnId: TURN })
        );
      });

      it('streams the proposal and quota of the continuation under its own turn id', async () => {
        const proposal = ProposedMutation.create({
          id: '77777777-7777-4777-8777-777777777777',
          kind: 'create',
          payload: { title: 'GTD', contentHtml: '<p>x</p>' },
          summary: 'Create GTD',
        })._unsafeUnwrap();
        const continueTurn = vi.fn<Execute>(async (_input, cb) => {
          cb.onQuota?.({
            tier: 'free',
            messages: { used: 2, limit: 30, resetsAt: '2026-09-29T00:00:00Z' },
          });
          cb.onModelStart?.();
          cb.onProposal(proposal);
        });
        const redis = createInMemoryClaimRedis();
        const gateway = makeGateway({
          handler: { continueTurn } as never,
          redis,
        });
        const client = makeClient('u1');

        await gateway.handleMessage(client as never, continueRequest());

        expect(client.emit).toHaveBeenCalledWith(
          'agent:quota',
          expect.objectContaining({ turnId: TURN })
        );
        expect(client.emit).toHaveBeenCalledWith(
          'agent:proposal',
          expect.objectContaining({ turnId: TURN, id: proposal.id })
        );
        expect(claimOf(redis)).toMatchObject({ status: 'settled' });
      });

      it('answers a resend of a settled continuation with agent:turn_settled and never runs it twice', async () => {
        const continueTurn = vi.fn<Execute>(completes);
        const gateway = makeGateway({ handler: { continueTurn } as never });
        await gateway.handleMessage(
          makeClient('u1') as never,
          continueRequest()
        );
        const resent = makeClient('u1', 'c2');

        await gateway.handleMessage(resent as never, continueRequest());

        expect(resent.emit.mock.calls).toEqual([
          [
            'agent:turn_settled',
            { turnId: TURN, conversationId: CONVERSATION },
          ],
        ]);
        expect(continueTurn).toHaveBeenCalledOnce();
      });

      it('lets a resend rerun a continuation that stored nothing', async () => {
        const redis = createInMemoryClaimRedis();
        const continueTurn = vi
          .fn<Execute>(completes)
          .mockImplementationOnce(async (_input, cb) => {
            cb.onModelStart?.();
            cb.onTurnDiscarded?.();
            cb.onError({ code: 'AI_PROVIDER_ERROR', message: 'boom' });
          });
        const gateway = makeGateway({
          handler: { continueTurn } as never,
          redis,
        });
        await gateway.handleMessage(
          makeClient('u1') as never,
          continueRequest()
        );
        expect(claimOf(redis)).toBeNull();
        const resent = makeClient('u1', 'c2');

        await gateway.handleMessage(resent as never, continueRequest());

        expect(continueTurn).toHaveBeenCalledTimes(2);
        expect(resent.emit).toHaveBeenCalledWith(
          'agent:done',
          expect.objectContaining({ turnId: TURN })
        );
        expect(resent.emit).not.toHaveBeenCalledWith(
          'agent:turn_settled',
          expect.anything()
        );
        expect(claimOf(redis)).toMatchObject({ status: 'settled' });
      });

      it('refuses its turn id once a message ran under it', async () => {
        const execute = vi.fn<Execute>(completes);
        const continueTurn = vi.fn<Execute>(completes);
        const gateway = makeGateway({
          handler: { execute, continueTurn } as never,
        });
        await gateway.handleMessage(makeClient('u1') as never, turn());
        const client = makeClient('u1', 'c2');

        await gateway.handleMessage(client as never, continueRequest());

        expect(turnErrors(client)).toEqual([
          expect.objectContaining({ code: 'TURN_ID_REUSED', turnId: TURN }),
        ]);
        expect(continueTurn).not.toHaveBeenCalled();
      });

      it('still routes a plain message to execute', async () => {
        const execute = vi.fn<Execute>(completes);
        const continueTurn = vi.fn();
        const gateway = makeGateway({
          handler: { execute, continueTurn } as never,
        });

        await gateway.handleMessage(makeClient('u1') as never, turn());

        expect(execute).toHaveBeenCalledOnce();
        expect(continueTurn).not.toHaveBeenCalled();
      });

      it.each([
        ['without a conversation', { conversationId: undefined }],
        ['without a turn id', { turnId: undefined }],
        ['with a message', { message: { content: 'hi' } }],
        [
          'with a continued turn id that is not a uuid',
          { continuesTurnId: 'x' },
        ],
        ['that names its own turn', { continuesTurnId: TURN }],
      ])('is refused as invalid %s', async (_label, over) => {
        const execute = vi.fn();
        const continueTurn = vi.fn();
        const gateway = makeGateway({ handler: { execute, continueTurn } });
        const client = makeClient('u1');

        await gateway.handleMessage(client as never, continueRequest(over));

        expect(turnErrors(client)).toEqual([
          expect.objectContaining({ code: 'VALIDATION_ERROR' }),
        ]);
        expect(execute).not.toHaveBeenCalled();
        expect(continueTurn).not.toHaveBeenCalled();
      });

      it('refuses a message carrying a field the protocol does not define', async () => {
        const execute = vi.fn();
        const gateway = makeGateway({ handler: { execute } });
        const client = makeClient('u1');

        await gateway.handleMessage(client as never, turn({ history: [] }));

        expect(turnErrors(client)).toEqual([
          expect.objectContaining({ code: 'VALIDATION_ERROR' }),
        ]);
        expect(execute).not.toHaveBeenCalled();
      });
    });
  });

  describe('a socket whose token expires', () => {
    const TOKEN_LIFETIME_MS = 60_000;
    const PAST_EXPIRY_MS = TOKEN_LIFETIME_MS + TOKEN_EXPIRY_GRACE_MS + 1_000;
    const TURN = '99999999-9999-4999-8999-999999999999';
    const doneUsage = {
      inputTokens: 1,
      outputTokens: 1,
      model: 'm',
      costUsd: 0,
      sources: [],
      knownNotes: [],
      webSources: [],
      stopReason: 'completed' as const,
      continuable: false,
    };

    type Execute = (
      input: unknown,
      callbacks: RunAgentTurnCallbacks,
      signal: AbortSignal
    ) => Promise<void>;

    async function connectedGateway(
      handler: Partial<RunAgentTurnHandler>,
      approve: Partial<ApproveMutationHandler> = {},
      redis = createInMemoryClaimRedis()
    ) {
      const exp = Math.floor((Date.now() + TOKEN_LIFETIME_MS) / 1000);
      const jwt = { verify: vi.fn().mockReturnValue({ sub: 'u1', exp }) };
      const gateway = makeGateway({ jwt, handler, approve, redis });
      const client = makeClient(undefined, 'c1', 'valid-token');
      await gateway.handleConnection(client as never);
      return { gateway, client };
    }

    function streamingTurn() {
      let finish!: () => void;
      const gate = new Promise<void>((resolve) => {
        finish = resolve;
      });
      const execute = vi.fn<Execute>(async (_input, cb, signal) => {
        cb.onModelStart?.();
        cb.onChunk('Half an ');
        await Promise.race([
          gate,
          new Promise<void>((resolve) =>
            signal.addEventListener('abort', () => resolve())
          ),
        ]);
        if (!signal.aborted) {
          cb.onChunk('answer.');
          cb.onDone(doneUsage);
        }
      });
      return { execute, finish };
    }

    const emitted = (client: ReturnType<typeof makeClient>) =>
      client.emit.mock.calls.map(([event, payload]) =>
        event === 'agent:error'
          ? `${event}:${(payload as { code: string }).code}`
          : event
      );

    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    function gated<T>(value: T) {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      return { release, wait: async () => (await gate, value) };
    }

    const committed = ok({
      result: { noteId: 'n1', title: 'GTD', kind: 'create' },
      outcome: 'created the note "GTD"',
      conversationId: 'conv-1',
      turnId: TURN,
    });

    it('lets the running turn finish and settle its claim, then asks for a fresh token and disconnects', async () => {
      const redis = createInMemoryClaimRedis();
      const turn = streamingTurn();
      const { gateway, client } = await connectedGateway(
        { execute: turn.execute } as never,
        {},
        redis
      );
      let claimAtAuthRequired: unknown;
      client.emit.mockImplementation((event: string, payload: unknown) => {
        if (
          event === 'agent:error' &&
          (payload as { code: string }).code === 'AUTH_REQUIRED'
        ) {
          const entry = redis.entries.get(`agent:turn:u1:${TURN}`);
          claimAtAuthRequired = entry && JSON.parse(entry.value);
        }
      });

      const running = gateway.handleMessage(client as never, {
        turnId: TURN,
        message: { content: 'hi' },
      });
      await vi.advanceTimersByTimeAsync(PAST_EXPIRY_MS);

      expect(client.disconnect).not.toHaveBeenCalled();
      expect(emitted(client)).toEqual(['agent:chunk']);

      turn.finish();
      await running;

      expect(emitted(client)).toEqual([
        'agent:chunk',
        'agent:chunk',
        'agent:done',
        'agent:error:AUTH_REQUIRED',
      ]);
      expect(claimAtAuthRequired).toMatchObject({ status: 'settled' });
      expect(client.disconnect).toHaveBeenCalledWith(true);
    });

    it('lets an approval that started before expiry commit and resume, then disconnects', async () => {
      const approval = gated(committed);
      const resumeTurn = vi.fn<Execute>(async (_input, cb) => {
        cb.onChunk('Done.');
        cb.onDone(doneUsage);
      });
      const { gateway, client } = await connectedGateway(
        { resumeTurn } as never,
        { execute: vi.fn(approval.wait) } as never
      );

      const approving = gateway.handleApprove(
        client as never,
        approvePayload()
      );
      await vi.advanceTimersByTimeAsync(PAST_EXPIRY_MS);

      expect(client.disconnect).not.toHaveBeenCalled();

      approval.release();
      await approving;

      expect(emitted(client)).toEqual([
        'agent:committed',
        'agent:chunk',
        'agent:done',
        'agent:error:AUTH_REQUIRED',
      ]);
      expect(resumeTurn).toHaveBeenCalledOnce();
      expect(client.disconnect).toHaveBeenCalledWith(true);
    });

    it('lets a resumed turn that started before expiry finish, then disconnects', async () => {
      const resume = streamingTurn();
      const { gateway, client } = await connectedGateway(
        { resumeTurn: resume.execute } as never,
        { execute: vi.fn().mockResolvedValue(committed) }
      );

      const approving = gateway.handleApprove(
        client as never,
        approvePayload()
      );
      await vi.advanceTimersByTimeAsync(PAST_EXPIRY_MS);

      expect(client.disconnect).not.toHaveBeenCalled();

      resume.finish();
      await approving;

      expect(emitted(client)).toEqual([
        'agent:committed',
        'agent:chunk',
        'agent:chunk',
        'agent:done',
        'agent:error:AUTH_REQUIRED',
      ]);
      expect(client.disconnect).toHaveBeenCalledWith(true);
    });

    it('ends the session once a turn stops on a proposal, since the proposal waits for the user', async () => {
      const decided = gated(undefined);
      const execute = vi.fn<Execute>(async (_input, cb) => {
        cb.onModelStart?.();
        cb.onChunk('I will create it.');
        await decided.wait();
        cb.onProposal(
          ProposedMutation.create({
            id: '77777777-7777-4777-8777-777777777777',
            kind: 'create',
            payload: { title: 'GTD', contentHtml: '<p>x</p>' },
            summary: 'Create GTD',
          })._unsafeUnwrap()
        );
      });
      const { gateway, client } = await connectedGateway({
        execute,
      } as never);

      const running = gateway.handleMessage(client as never, {
        turnId: TURN,
        message: { content: 'create GTD' },
      });
      await vi.advanceTimersByTimeAsync(PAST_EXPIRY_MS);
      expect(client.disconnect).not.toHaveBeenCalled();

      decided.release();
      await running;

      expect(emitted(client)).toEqual([
        'agent:chunk',
        'agent:proposal',
        'agent:error:AUTH_REQUIRED',
      ]);
      expect(client.disconnect).toHaveBeenCalledWith(true);
    });

    it('logs the deferred expiry', async () => {
      const log = vi
        .spyOn(Logger.prototype, 'log')
        .mockImplementation(() => undefined);
      const turn = streamingTurn();
      const { gateway, client } = await connectedGateway({
        execute: turn.execute,
      } as never);

      const running = gateway.handleMessage(client as never, {
        message: { content: 'hi' },
      });
      await vi.advanceTimersByTimeAsync(PAST_EXPIRY_MS);

      expect(log).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'agent.client.expiry_deferred',
          clientId: 'c1',
          userId: 'u1',
        })
      );
      turn.finish();
      await running;
      log.mockRestore();
    });

    it('refuses a new message, approval or rejection on the expired socket without running anything', async () => {
      const turn = streamingTurn();
      const approveExecute = vi.fn();
      const { gateway, client } = await connectedGateway(
        { execute: turn.execute } as never,
        { execute: approveExecute }
      );
      const running = gateway.handleMessage(client as never, {
        message: { content: 'first' },
      });
      await vi.advanceTimersByTimeAsync(PAST_EXPIRY_MS);

      await gateway.handleMessage(client as never, {
        turnId: TURN,
        message: { content: 'second' },
      });
      await gateway.handleApprove(client as never, approvePayload());
      await gateway.handleReject(client as never, approvePayload());

      expect(emitted(client)).toEqual([
        'agent:chunk',
        'agent:error:AUTH_REQUIRED',
        'agent:error:AUTH_REQUIRED',
        'agent:error:AUTH_REQUIRED',
      ]);
      expect(turn.execute).toHaveBeenCalledOnce();
      expect(approveExecute).not.toHaveBeenCalled();
      turn.finish();
      await running;
    });

    it('still lets the user stop the running turn, and then disconnects', async () => {
      const turn = streamingTurn();
      const { gateway, client } = await connectedGateway({
        execute: turn.execute,
      } as never);
      const running = gateway.handleMessage(client as never, {
        message: { content: 'hi' },
      });
      await vi.advanceTimersByTimeAsync(PAST_EXPIRY_MS);

      gateway.handleCancel(client as never);
      await running;

      expect(emitted(client)).toEqual([
        'agent:chunk',
        'agent:error:AUTH_REQUIRED',
      ]);
      expect(client.disconnect).toHaveBeenCalledWith(true);
    });
  });

  describe('AgentGateway daily message quota', () => {
    const TURN = '77777777-7777-4777-8777-777777777777';
    const QUOTA = {
      tier: 'free',
      messages: { used: 3, limit: 30, resetsAt: '2026-09-28T00:00:00.000Z' },
    } as const;

    it('emits agent:quota with the turn id whenever the handler reports the quota', async () => {
      const execute = vi.fn(
        async (_input: unknown, callbacks: RunAgentTurnCallbacks) => {
          callbacks.onQuota?.(QUOTA);
        }
      );
      const gateway = makeGateway({ handler: { execute } });
      const client = makeClient('u1');

      await gateway.handleMessage(client as never, {
        turnId: TURN,
        message: { content: 'hi' },
      });

      expect(client.emit).toHaveBeenCalledWith('agent:quota', {
        turnId: TURN,
        ...QUOTA,
      });
    });

    it('emits AI_QUOTA_EXHAUSTED with its reset instant and upgrade', async () => {
      const execute = vi.fn(
        async (_input: unknown, callbacks: RunAgentTurnCallbacks) => {
          callbacks.onError(
            AIErrors.quotaExhausted(
              new Date('2026-09-28T00:00:00.000Z'),
              'register'
            )
          );
        }
      );
      const gateway = makeGateway({ handler: { execute } });
      const client = makeClient('u1');

      await gateway.handleMessage(client as never, {
        turnId: TURN,
        message: { content: 'hi' },
      });

      expect(client.emit).toHaveBeenCalledWith('agent:error', {
        code: 'AI_QUOTA_EXHAUSTED',
        message: expect.any(String),
        resetsAt: '2026-09-28T00:00:00.000Z',
        upgrade: 'register',
        turnId: TURN,
      });
    });

    it('releases the claim of an exhausted turn, so a resend of it runs again', async () => {
      const execute = vi.fn(
        async (_input: unknown, callbacks: RunAgentTurnCallbacks) => {
          callbacks.onError(
            AIErrors.quotaExhausted(
              new Date('2026-09-28T00:00:00.000Z'),
              'byok'
            )
          );
        }
      );
      const gateway = makeGateway({ handler: { execute } });
      const client = makeClient('u1');
      const payload = { turnId: TURN, message: { content: 'hi' } };

      await gateway.handleMessage(client as never, payload);
      await gateway.handleMessage(client as never, payload);

      expect(execute).toHaveBeenCalledTimes(2);
    });

    it('keeps the turn running when the agent:quota emit throws', async () => {
      const execute = vi.fn(
        async (_input: unknown, callbacks: RunAgentTurnCallbacks) => {
          callbacks.onQuota?.(QUOTA);
          callbacks.onDone({
            inputTokens: 1,
            outputTokens: 1,
            model: 'test-model',
            costUsd: 0,
            sources: [],
            knownNotes: [],
            webSources: [],
            stopReason: AGENT_STOP_REASON.COMPLETED,
            continuable: false,
          });
        }
      );
      const gateway = makeGateway({ handler: { execute } });
      const client = makeClient('u1');
      client.emit = vi.fn((event: string) => {
        if (event === 'agent:quota') {
          throw new Error('socket write failed');
        }
      });
      const log = vi
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);

      try {
        await gateway.handleMessage(client as never, {
          turnId: TURN,
          message: { content: 'hi' },
        });

        expect(log).toHaveBeenCalledWith({
          event: 'agent.quota.emit_failed',
          turnId: TURN,
          error: 'socket write failed',
        });
        expect(client.emit).toHaveBeenCalledWith(
          'agent:done',
          expect.objectContaining({ turnId: TURN })
        );
      } finally {
        log.mockRestore();
      }
    });
  });
});
