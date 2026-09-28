import type { RequestUser } from '@jovandyaz/auth/server';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ok } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';

import { FEATURE_FLAG_KEYS } from '@knowtis/shared-types';

import { createExecutionContext } from '../ai/testing/create-execution-context';
import { FEATURE_FLAG_KEY } from '../feature-flags/feature-flag.guard';
import { AiOrganizationController } from './ai-organization.controller';
import type { SuggestOrganizationDto } from './dto/suggest-organization.dto';

const ANONYMOUS_ID = 'anon-1';
const EDGE_IP = '203.0.113.9';
const SOCKET_IP = '10.0.0.7';
const NOTE_ID = '11111111-1111-4111-8111-111111111502';

describe('AiOrganizationController', () => {
  const reflector = new Reflector();

  const requiredFlags = () =>
    reflector.getAllAndMerge<string[]>(FEATURE_FLAG_KEY, [
      AiOrganizationController.prototype.suggest,
      AiOrganizationController,
    ]);

  it('requires only the AI kill switch', () => {
    expect(requiredFlags()).toEqual([FEATURE_FLAG_KEYS.AI_ENABLED]);
  });

  it("suggests on the anonymous caller's resolved tier and edge IP", async () => {
    const execution = createExecutionContext({
      userId: ANONYMOUS_ID,
      tier: 'anonymous',
      clientIp: EDGE_IP,
    });
    const tierResolver = { resolve: vi.fn().mockResolvedValue(execution) };
    const suggestHandler = { execute: vi.fn().mockResolvedValue(ok([])) };
    const controller = new AiOrganizationController(
      suggestHandler as never,
      tierResolver as never
    );

    await controller.suggest(
      { id: ANONYMOUS_ID, isAnonymous: true } as RequestUser,
      { noteIds: [NOTE_ID] } as SuggestOrganizationDto,
      { headers: { 'x-real-ip': EDGE_IP }, ip: SOCKET_IP } as unknown as Request
    );

    expect(tierResolver.resolve).toHaveBeenCalledWith({
      userId: ANONYMOUS_ID,
      isAnonymous: true,
      clientIp: EDGE_IP,
    });
    expect(suggestHandler.execute).toHaveBeenCalledWith({
      execution,
      noteIds: [NOTE_ID],
    });
    expect(suggestHandler.execute.mock.calls[0]?.[0].execution).toBe(execution);
  });
});
