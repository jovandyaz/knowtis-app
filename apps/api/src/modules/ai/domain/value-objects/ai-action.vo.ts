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
 * Actions whose own endpoint carries a flag narrower than `ai_enabled`:
 * `/ai/voice-note` behind `voice_notes_enabled`, `/ai/organization/suggest`
 * behind `ai_auto_organize`.
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
 * `ai:complete` socket event are gated on `ai_enabled` alone, so an action
 * owned by a narrower-flagged endpoint must stay out of this set — otherwise
 * that flag is inert and callers reach the action through the generic route.
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
