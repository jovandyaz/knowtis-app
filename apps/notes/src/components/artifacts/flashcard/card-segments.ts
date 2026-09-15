import type { SegmentState } from '@knowtis/design-system';
import type { CardSessionStatus } from '@knowtis/shared-types';

export function toCardSegments(
  statuses: CardSessionStatus[],
  currentIndex: number,
  isComplete: boolean
): SegmentState[] {
  return statuses.map((status, index) =>
    status === 'pending' && index === currentIndex && !isComplete
      ? 'current'
      : status
  );
}
