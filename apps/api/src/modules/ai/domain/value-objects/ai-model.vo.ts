import { err, ok, type Result } from 'neverthrow';

import type { ModelCatalog } from '@knowtis/ai-gateway';

import { AIErrors, type AIDomainError } from '../errors/ai.errors';

export class AIModel {
  private constructor(public readonly value: string) {}

  static create(
    model: string,
    catalog: ModelCatalog
  ): Result<AIModel, AIDomainError> {
    if (!model || !catalog.isSupported(model)) {
      return err(AIErrors.invalidModel(model));
    }
    return ok(new AIModel(model));
  }

  get provider(): string {
    return this.value.split(':')[0];
  }

  toPrimitive(): string {
    return this.value;
  }
}
