import { join } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { PromptLoaderService } from './prompt-loader.service';

const PROMPTS_DIR = join(__dirname, '../../prompts');

describe('PromptLoaderService', () => {
  let service: PromptLoaderService;

  beforeEach(() => {
    service = new PromptLoaderService(PROMPTS_DIR);
  });

  it('should load all prompt files without error', () => {
    expect(() => service.onModuleInit()).not.toThrow();
  });

  it('should return a prompt by action id', () => {
    service.onModuleInit();
    const prompt = service.getPrompt('summarize');
    expect(prompt).toBeDefined();
    expect(prompt.id).toBe('summarize');
    expect(prompt.category).toBe('writing');
    expect(prompt.content).toContain('Summarize');
  });

  it('should resolve PRESERVE_LANGUAGE partial', () => {
    service.onModuleInit();
    const prompt = service.getPrompt('summarize');
    expect(prompt.content).toContain('Detect the language');
    expect(prompt.content).toContain('SAME language');
    expect(prompt.content).not.toContain('{{PRESERVE_LANGUAGE}}');
  });

  it('should NOT resolve partial for prompts that do not use it', () => {
    service.onModuleInit();
    const prompt = service.getPrompt('ghost-text');
    expect(prompt.content).not.toContain('Detect the language');
  });

  it('should throw for unknown action id', () => {
    service.onModuleInit();
    expect(() => service.getPrompt('nonexistent')).toThrow(
      'Prompt not found: nonexistent'
    );
  });

  it('should load voice-transcription with empty content', () => {
    service.onModuleInit();
    const prompt = service.getPrompt('voice-transcription');
    expect(prompt.content.trim()).toBe('');
  });

  it('should expose cache metadata from frontmatter', () => {
    service.onModuleInit();
    const summarize = service.getPrompt('summarize');
    expect(summarize.cache).toBe(true);
    const ghostText = service.getPrompt('ghost-text');
    expect(ghostText.cache).toBe(false);
  });

  it('should load all 19 expected action ids', () => {
    service.onModuleInit();
    const expectedIds = [
      'summarize',
      'expand',
      'translate',
      'tone',
      'outline',
      'improve-writing',
      'fix-spelling',
      'make-shorter',
      'make-longer',
      'action-items',
      'ghost-text',
      'chat',
      'generate-flashcards',
      'generate-quiz',
      'generate-summary',
      'generate-mind-map',
      'learn-topic',
      'structure-voice-note',
      'voice-transcription',
    ];
    for (const id of expectedIds) {
      expect(() => service.getPrompt(id)).not.toThrow();
    }
  });
});
