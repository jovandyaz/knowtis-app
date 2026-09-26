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
 * Actions the notes client never sends to `/ai/complete` or `ai:complete`:
 * `SUGGEST_ORGANIZATION` and the voice actions are owned by a dedicated
 * endpoint (`/ai/organization/suggest`, `/ai/voice-note`); `GENERATE_FLASHCARDS`,
 * `GENERATE_QUIZ`, `GENERATE_SUMMARY` and `GENERATE_MIND_MAP` are produced only
 * by the artifacts module.
 */
const NON_COMPLETION_ACTIONS = [
  AI_ACTION.SUGGEST_ORGANIZATION,
  AI_ACTION.VOICE_TRANSCRIPTION,
  AI_ACTION.STRUCTURE_VOICE_NOTE,
  AI_ACTION.GENERATE_FLASHCARDS,
  AI_ACTION.GENERATE_QUIZ,
  AI_ACTION.GENERATE_SUMMARY,
  AI_ACTION.GENERATE_MIND_MAP,
] as const;

export type CompletionAIAction = Exclude<
  SupportedAIAction,
  (typeof NON_COMPLETION_ACTIONS)[number]
>;

/**
 * Actions the generic completion surface accepts. `/ai/complete` and the
 * `ai:complete` socket event skip the checks a dedicated endpoint applies to
 * its action, such as note ownership or a tighter throttle, so an action owned
 * by one must stay out of this set — otherwise callers reach it around them.
 */
export const COMPLETION_AI_ACTIONS = SUPPORTED_AI_ACTIONS.filter(
  (action): action is CompletionAIAction =>
    !NON_COMPLETION_ACTIONS.some((excluded) => excluded === action)
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
