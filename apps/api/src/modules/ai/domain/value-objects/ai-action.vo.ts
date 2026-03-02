import { err, ok, type Result } from 'neverthrow';

import { AIErrors, type AIDomainError } from '../errors/ai.errors';

export const SUPPORTED_AI_ACTIONS = [
  'summarize',
  'expand',
  'translate',
  'tone',
  'outline',
  'action-items',
  'ghost-text',
  'chat',
] as const;

export type SupportedAIAction = (typeof SUPPORTED_AI_ACTIONS)[number];

export class AIAction {
  private constructor(public readonly value: SupportedAIAction) {}

  static create(action: string): Result<AIAction, AIDomainError> {
    if (
      !action ||
      !SUPPORTED_AI_ACTIONS.includes(action as SupportedAIAction)
    ) {
      return err(AIErrors.invalidAction(action));
    }
    return ok(new AIAction(action as SupportedAIAction));
  }

  toPrimitive(): SupportedAIAction {
    return this.value;
  }
}
