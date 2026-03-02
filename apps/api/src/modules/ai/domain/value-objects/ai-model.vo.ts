import { err, ok, type Result } from 'neverthrow';

import { AIErrors, type AIDomainError } from '../errors/ai.errors';

const SUPPORTED_MODELS = [
  'anthropic:claude-sonnet-4-5-20250929',
  'anthropic:claude-haiku-4-5-20251001',
] as const;

const FAST_MODELS = new Set<string>(['anthropic:claude-haiku-4-5-20251001']);

export type SupportedModel = (typeof SUPPORTED_MODELS)[number];

export class AIModel {
  private constructor(
    public readonly value: SupportedModel,
    public readonly isFast: boolean
  ) {}

  static create(model: string): Result<AIModel, AIDomainError> {
    if (!model || !SUPPORTED_MODELS.includes(model as SupportedModel)) {
      return err(AIErrors.invalidModel(model));
    }
    return ok(new AIModel(model as SupportedModel, FAST_MODELS.has(model)));
  }

  get provider(): string {
    return this.value.split(':')[0];
  }

  toPrimitive(): SupportedModel {
    return this.value;
  }
}
