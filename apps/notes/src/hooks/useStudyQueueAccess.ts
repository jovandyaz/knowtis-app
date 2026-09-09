import {
  useFeatureFlag,
  useFeatureFlags,
} from '@knowtis/data-access-feature-flags';
import { FEATURE_FLAG_KEYS } from '@knowtis/shared-types';

/** Whether this user may see the study queue: true only once the flags have settled with `ai_enabled` on. */
export function useStudyQueueAccess() {
  const flags = useFeatureFlags();
  const isFlagOn = useFeatureFlag(FEATURE_FLAG_KEYS.AI_ENABLED);

  return {
    isEnabled: !flags.isPending && isFlagOn,
    isPending: flags.isPending,
    isError: flags.isError,
    refetch: flags.refetch,
  };
}
