import { err, ok, type Result } from 'neverthrow';

import {
  AI_ACTIONS,
  type AIAction as AIActionType,
} from '@knowtis/shared-types';

import { AIErrors, type AIDomainError } from '../errors/ai.errors';

export const SUPPORTED_AI_ACTIONS = AI_ACTIONS;
export type SupportedAIAction = AIActionType;

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
