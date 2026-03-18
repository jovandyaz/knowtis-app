import { ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AI_ACTION } from '@knowtis/shared-types';

import type { AIOrchestrator } from '../../../ai/application/services/ai-orchestrator.service';
import type { AIRateLimitService } from '../../../ai/application/services/ai-rate-limit.service';
import type { AIStructuredOutputProvider } from '../../../ai/domain/ports/ai-structured-output.port';
import { AIModel } from '../../../ai/domain/value-objects/ai-model.vo';
import { ArtifactErrorCodes } from '../../domain/errors';
import type {
  ArtifactEntity,
  ArtifactWriteRepository,
} from '../../domain/ports';
import { AIGenerationPipeline } from '../services/ai-generation.pipeline';
import { GenerateArtifactHandler } from './generate-artifact.handler';

const MOCK_USER_ID = 'user-123';
const MOCK_NOTE_ID = 'note-456';
const MOCK_MODEL = 'anthropic:claude-sonnet-4-20250514';

function createMockArtifactEntity(
  overrides: Partial<ArtifactEntity> = {}
): ArtifactEntity {
  return {
    id: 'artifact-789',
    type: 'flashcard_deck',
    userId: MOCK_USER_ID,
    sourceNoteId: MOCK_NOTE_ID,
    title: 'Flashcards: Test Note',
    content: {
      cards: [
        { front: 'What is X?', back: 'X is Y', difficulty: 'easy' as const },
      ],
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('GenerateArtifactHandler', () => {
  let handler: GenerateArtifactHandler;
  let repository: {
    create: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  let structuredOutput: { generateStructuredOutput: ReturnType<typeof vi.fn> };
  let orchestrator: {
    selectModel: ReturnType<typeof vi.fn>;
    getSystemPrompt: ReturnType<typeof vi.fn>;
  };
  let rateLimitService: {
    checkLimit: ReturnType<typeof vi.fn>;
    recordUsage: ReturnType<typeof vi.fn>;
  };
  let pipeline: AIGenerationPipeline;

  beforeEach(() => {
    repository = {
      create: vi.fn(),
      delete: vi.fn(),
    };

    structuredOutput = {
      generateStructuredOutput: vi.fn(),
    };

    orchestrator = {
      selectModel: vi.fn(),
      getSystemPrompt: vi.fn(),
    };

    rateLimitService = {
      checkLimit: vi.fn(),
      recordUsage: vi.fn(),
    };

    pipeline = new AIGenerationPipeline(
      structuredOutput as unknown as AIStructuredOutputProvider,
      orchestrator as unknown as AIOrchestrator,
      rateLimitService as unknown as AIRateLimitService
    );

    handler = new GenerateArtifactHandler(
      repository as unknown as ArtifactWriteRepository,
      pipeline
    );
  });

  const baseInput = {
    userId: MOCK_USER_ID,
    noteId: MOCK_NOTE_ID,
    noteContent:
      '<p>Photosynthesis is the process by which plants convert sunlight into energy.</p>',
    noteTitle: 'Test Note',
    type: 'flashcard_deck' as const,
  };

  describe('successful generation', () => {
    it('should generate flashcards and persist the artifact', async () => {
      const flashcardContent = {
        cards: [
          {
            front: 'What is photosynthesis?',
            back: 'The process by which plants convert sunlight into energy',
            difficulty: 'easy' as const,
          },
        ],
      };

      const mockEntity = createMockArtifactEntity({
        content: flashcardContent,
      });

      rateLimitService.checkLimit.mockResolvedValue({ allowed: true });
      orchestrator.selectModel.mockReturnValue(AIModel.create(MOCK_MODEL));
      orchestrator.getSystemPrompt.mockReturnValue(
        'You are a study assistant.'
      );
      structuredOutput.generateStructuredOutput.mockResolvedValue({
        object: flashcardContent,
        inputTokens: 100,
        outputTokens: 200,
      });
      rateLimitService.recordUsage.mockResolvedValue(undefined);
      repository.create.mockResolvedValue(ok(mockEntity));

      const result = await handler.execute(baseInput);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.id).toBe('artifact-789');
        expect(result.value.type).toBe('flashcard_deck');
      }

      expect(rateLimitService.checkLimit).toHaveBeenCalledWith(
        MOCK_USER_ID,
        expect.any(Number)
      );
      expect(orchestrator.selectModel).toHaveBeenCalledWith(
        AI_ACTION.GENERATE_FLASHCARDS
      );
      expect(orchestrator.getSystemPrompt).toHaveBeenCalledWith(
        AI_ACTION.GENERATE_FLASHCARDS
      );
      expect(structuredOutput.generateStructuredOutput).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        {
          model: MOCK_MODEL,
          system: 'You are a study assistant.',
        }
      );
      expect(repository.create).toHaveBeenCalledWith({
        type: 'flashcard_deck',
        userId: MOCK_USER_ID,
        sourceNoteId: MOCK_NOTE_ID,
        title: 'Flashcards: Test Note',
        content: flashcardContent,
      });
    });

    it('should record usage as fire-and-forget', async () => {
      const flashcardContent = {
        cards: [{ front: 'Q', back: 'A', difficulty: 'easy' as const }],
      };

      rateLimitService.checkLimit.mockResolvedValue({ allowed: true });
      orchestrator.selectModel.mockReturnValue(AIModel.create(MOCK_MODEL));
      orchestrator.getSystemPrompt.mockReturnValue('prompt');
      structuredOutput.generateStructuredOutput.mockResolvedValue({
        object: flashcardContent,
        inputTokens: 50,
        outputTokens: 100,
      });
      rateLimitService.recordUsage.mockResolvedValue(undefined);
      repository.create.mockResolvedValue(
        ok(createMockArtifactEntity({ content: flashcardContent }))
      );

      await handler.execute(baseInput);

      expect(rateLimitService.recordUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: MOCK_USER_ID,
          action: AI_ACTION.GENERATE_FLASHCARDS,
          model: MOCK_MODEL,
          inputTokens: 50,
          outputTokens: 100,
        })
      );
    });
  });

  describe('rate limit rejection', () => {
    it('should return an error when rate limit is exceeded', async () => {
      rateLimitService.checkLimit.mockResolvedValue({
        allowed: false,
        reason: 'Daily usage limit exceeded. Please try again tomorrow.',
      });

      const result = await handler.execute(baseInput);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe(ArtifactErrorCodes.GENERATION_FAILED);
        expect(result.error.message).toContain('Daily usage limit exceeded');
      }

      expect(orchestrator.selectModel).not.toHaveBeenCalled();
      expect(structuredOutput.generateStructuredOutput).not.toHaveBeenCalled();
      expect(repository.create).not.toHaveBeenCalled();
    });
  });

  describe('empty content', () => {
    it('should return an error when note content is empty', async () => {
      const result = await handler.execute({
        ...baseInput,
        noteContent: '',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe(ArtifactErrorCodes.GENERATION_FAILED);
        expect(result.error.message).toContain('empty');
      }
    });
  });

  describe('AI provider error', () => {
    it('should return a generation failed error when the provider throws', async () => {
      rateLimitService.checkLimit.mockResolvedValue({ allowed: true });
      orchestrator.selectModel.mockReturnValue(AIModel.create(MOCK_MODEL));
      orchestrator.getSystemPrompt.mockReturnValue('prompt');
      structuredOutput.generateStructuredOutput.mockRejectedValue(
        new Error('Provider unavailable')
      );

      const result = await handler.execute(baseInput);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe(ArtifactErrorCodes.GENERATION_FAILED);
        expect(result.error.message).toContain('Provider unavailable');
      }
    });
  });
});
