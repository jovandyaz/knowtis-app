import {
  STUDY_DURATION_BUCKETS,
  type StudyDurationBucket,
} from '@knowtis/shared-types';

const MS_PER_MINUTE = 60_000;
const STUDY_DURATION_BUCKET_CEILINGS_MIN = [2, 5, 15] as const;

/** Maps a session's elapsed time onto `STUDY_DURATION_BUCKETS`. */
export function studyDurationBucket(durationMs: number): StudyDurationBucket {
  const minutes = durationMs / MS_PER_MINUTE;
  const index = STUDY_DURATION_BUCKET_CEILINGS_MIN.findIndex(
    (ceiling) => minutes < ceiling
  );
  return STUDY_DURATION_BUCKETS[
    index === -1 ? STUDY_DURATION_BUCKETS.length - 1 : index
  ];
}
