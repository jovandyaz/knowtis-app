import { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { EnvConfig } from '../../../../config/env.config';
import { AIOrchestrator } from './ai-orchestrator.service';

type TypedConfigService = ConfigService<EnvConfig, true>;

describe('AIOrchestrator', () => {
  let orchestrator: AIOrchestrator;

  beforeEach(() => {
    const mockConfig = {
      get: vi.fn((key: string) => {
        const config: Record<string, string> = {
          AI_DEFAULT_MODEL: 'anthropic:claude-sonnet-4-5-20250929',
          AI_FAST_MODEL: 'anthropic:claude-haiku-4-5-20251001',
        };
        return config[key];
      }),
    } as unknown as TypedConfigService;
    orchestrator = new AIOrchestrator(mockConfig);
  });

  it('should route ghost-text to fast model', () => {
    const result = orchestrator.selectModel('ghost-text');
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().toPrimitive()).toBe(
      'anthropic:claude-haiku-4-5-20251001'
    );
  });

  it('should route summarize to default model', () => {
    const result = orchestrator.selectModel('summarize');
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().toPrimitive()).toBe(
      'anthropic:claude-sonnet-4-5-20250929'
    );
  });

  it('should route expand to default model', () => {
    const result = orchestrator.selectModel('expand');
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().toPrimitive()).toBe(
      'anthropic:claude-sonnet-4-5-20250929'
    );
  });

  it('should return err for unsupported model from config', () => {
    const mockConfig = {
      get: vi.fn().mockReturnValue('gpt-4o'),
    } as unknown as TypedConfigService;
    const orch = new AIOrchestrator(mockConfig);
    const result = orch.selectModel('summarize');
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe('AI_INVALID_MODEL');
  });

  it('should generate system prompt for summarize', () => {
    const prompt = orchestrator.getSystemPrompt('summarize');
    expect(prompt).toContain('ummar');
  });

  it('should generate system prompt for ghost-text', () => {
    const prompt = orchestrator.getSystemPrompt('ghost-text');
    expect(prompt).toContain('ontinue');
  });

  describe('buildUserPrompt', () => {
    it('should return content as-is for plain actions', () => {
      const result = orchestrator.buildUserPrompt(
        { content: 'Some text' },
        'summarize'
      );
      expect(result).toBe('Some text');
    });

    it('should prefer selection over content', () => {
      const result = orchestrator.buildUserPrompt(
        { content: 'Full doc', selection: 'Selected part' },
        'summarize'
      );
      expect(result).toBe('Selected part');
    });

    it('should build translate prompt with target language', () => {
      const result = orchestrator.buildUserPrompt(
        { content: 'Hello world', targetLanguage: 'Spanish' },
        'translate'
      );
      expect(result).toBe('Translate to Spanish:\n\nHello world');
    });

    it('should build tone prompt with target tone', () => {
      const result = orchestrator.buildUserPrompt(
        { content: 'Hey there', targetTone: 'formal' },
        'tone'
      );
      expect(result).toBe('Rewrite in a formal tone:\n\nHey there');
    });

    it('should use selection for translate when both provided', () => {
      const result = orchestrator.buildUserPrompt(
        { content: 'Full doc', selection: 'Part', targetLanguage: 'French' },
        'translate'
      );
      expect(result).toBe('Translate to French:\n\nPart');
    });

    it('should ignore targetLanguage for non-translate actions', () => {
      const result = orchestrator.buildUserPrompt(
        { content: 'Text', targetLanguage: 'Spanish' },
        'summarize'
      );
      expect(result).toBe('Text');
    });
  });
});
