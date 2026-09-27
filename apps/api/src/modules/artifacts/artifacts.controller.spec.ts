import type { RequestUser } from '@jovandyaz/auth/server';
import type { Request } from 'express';
import { ok } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';

import { createExecutionContext } from '../ai/testing/create-execution-context';
import { ArtifactsController } from './artifacts.controller';
import type { GenerateArtifactDto } from './dto/artifacts.dto';

const ANONYMOUS_ID = 'anon-1';
const EDGE_IP = '203.0.113.9';
const SOCKET_IP = '10.0.0.7';
const NOTE_ID = '11111111-1111-4111-8111-111111111501';

describe('ArtifactsController generate', () => {
  it("generates on the anonymous caller's resolved tier and edge IP", async () => {
    const execution = createExecutionContext({
      userId: ANONYMOUS_ID,
      tier: 'anonymous',
      clientIp: EDGE_IP,
    });
    const tierResolver = { resolve: vi.fn().mockResolvedValue(execution) };
    const generateArtifactHandler = {
      execute: vi.fn().mockResolvedValue(ok({ id: 'artifact-1' })),
    };
    const getNoteHandler = {
      execute: vi
        .fn()
        .mockResolvedValue(ok({ title: 'Note', content: '<p>Body</p>' })),
    };
    const controller = new ArtifactsController(
      generateArtifactHandler as never,
      {} as never,
      {} as never,
      {} as never,
      getNoteHandler as never,
      tierResolver as never
    );

    await controller.generate(
      { id: ANONYMOUS_ID, isAnonymous: true } as RequestUser,
      { noteId: NOTE_ID, type: 'flashcard_deck' } as GenerateArtifactDto,
      { headers: { 'x-real-ip': EDGE_IP }, ip: SOCKET_IP } as unknown as Request
    );

    expect(tierResolver.resolve).toHaveBeenCalledWith({
      userId: ANONYMOUS_ID,
      isAnonymous: true,
      clientIp: EDGE_IP,
    });
    expect(generateArtifactHandler.execute).toHaveBeenCalledOnce();
    expect(generateArtifactHandler.execute.mock.calls[0]?.[0].execution).toBe(
      execution
    );
  });
});
