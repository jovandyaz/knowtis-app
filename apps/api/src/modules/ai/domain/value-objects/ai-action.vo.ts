import { err, ok, type Result } from 'neverthrow';

import {
  AI_ACTION,
  AI_ACTIONS,
  type AIAction as AIActionType,
} from '@knowtis/shared-types';

import { AIErrors, type AIDomainError } from '../errors/ai.errors';

export const SUPPORTED_AI_ACTIONS = AI_ACTIONS;
export type SupportedAIAction = AIActionType;

/**
 * Actions owned by a dedicated endpoint: `/ai/voice-note` and
 * `/ai/organization/suggest`.
 */
const DEDICATED_ENDPOINT_ACTIONS = [
  AI_ACTION.SUGGEST_ORGANIZATION,
  AI_ACTION.VOICE_TRANSCRIPTION,
  AI_ACTION.STRUCTURE_VOICE_NOTE,
] as const;

export type CompletionAIAction = Exclude<
  SupportedAIAction,
  (typeof DEDICATED_ENDPOINT_ACTIONS)[number]
>;

/**
 * Actions the generic completion surface accepts. `/ai/complete` and the
 * `ai:complete` socket event skip the checks a dedicated endpoint applies to
 * its action, such as note ownership or a tighter throttle, so an action owned
 * by one must stay out of this set — otherwise callers reach it around them.
 */
export const COMPLETION_AI_ACTIONS = SUPPORTED_AI_ACTIONS.filter(
  (action): action is CompletionAIAction =>
    !DEDICATED_ENDPOINT_ACTIONS.some((dedicated) => dedicated === action)
);

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
