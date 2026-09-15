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

export function toQuizSegments(
  statuses: ReadonlyArray<'correct' | 'incorrect' | 'unanswered'>,
  position: number,
  completed: boolean
): SegmentState[] {
  return statuses.map((status, index) => {
    if (status === 'correct') {
      return 'correct';
    }
    if (status === 'incorrect') {
      return 'wrong';
    }
    return !completed && index === position ? 'current' : 'pending';
  });
}
