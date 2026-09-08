import {
  useFeatureFlag,
  useFeatureFlags,
} from '@knowtis/data-access-feature-flags';
import { FEATURE_FLAG_KEYS } from '@knowtis/shared-types';

/**
 * Whether this user may see the study queue. `isEnabled` is only true once the
 * flags have settled, so callers can gate the study queries on it and keep the
 * feature dark at the network layer while the flag is off.
 */
export function useStudyQueueAccess() {
  const flags = useFeatureFlags();
  const isFlagOn = useFeatureFlag(FEATURE_FLAG_KEYS.STUDY_REVIEW_QUEUE);

  return {
    isEnabled: !flags.isPending && isFlagOn,
    isPending: flags.isPending,
    isError: flags.isError,
    refetch: flags.refetch,
  };
}
