import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import type { HTMLMotionProps } from 'motion/react';

import {
  useMotionPreset,
  type OutcomeStampVerdict,
} from '@knowtis/design-system';
import { CARD_STATUS, type SM2Quality } from '@knowtis/shared-types';

import { toCardSegments } from './card-segments';
import {
  findNextPendingIndex,
  type useFlashcardSession,
} from './use-flashcard-session';

const EXIT_X: Record<OutcomeStampVerdict, number> = {
  correct: 60,
  wrong: -60,
  skipped: 0,
};

interface RatingPresentation {
  identity: string;
  index: number;
  verdict: OutcomeStampVerdict;
  quality: SM2Quality | null;
  phase: 'saving' | 'exiting';
}

interface RatingPresentationOptions {
  artifactId: string;
  session: Pick<
    ReturnType<typeof useFlashcardSession>,
    | 'currentCard'
    | 'currentIndex'
    | 'cardStatuses'
    | 'isComplete'
    | 'rateAdvanced'
    | 'skip'
    | 'totalCards'
    | 'navigate'
    | 'restart'
    | 'reviewSkipped'
    | 'flip'
  >;
  readOnly?: boolean | undefined;
  reviewCard: (input: {
    artifactId: string;
    cardIndex: number;
    quality: SM2Quality;
  }) => Promise<unknown>;
  onCommitted: (quality: SM2Quality | null) => void;
  onError: () => void;
}

export function useRatingPresentation({
  artifactId,
  session,
  readOnly,
  reviewCard,
  onCommitted,
  onError,
}: RatingPresentationOptions) {
  const preset = useMotionPreset();
  const [presentation, setPresentation] = useState<RatingPresentation | null>(
    null
  );
  const [runKey, setRunKey] = useState(0);
  const mountedCardRef = useRef<{
    node: HTMLButtonElement;
    identity: string;
  } | null>(null);
  const interactionLockRef = useRef(false);
  const presentationRef = useRef<RatingPresentation | null>(null);
  const presentationConsumedRef = useRef(false);
  const mountedRef = useRef(true);
  const currentIdentity = session.currentCard
    ? `${session.currentCard.artifactId}:${session.currentCard.cardIndex}`
    : '';
  const currentIdentityRef = useRef(currentIdentity);
  useLayoutEffect(() => {
    currentIdentityRef.current = currentIdentity;
  }, [currentIdentity]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      interactionLockRef.current = false;
      presentationRef.current = null;
    };
  }, [artifactId]);

  const updatePresentation = useCallback(
    (nextPresentation: RatingPresentation | null) => {
      presentationRef.current = nextPresentation;
      setPresentation(nextPresentation);
    },
    []
  );

  const focusCard = useCallback(
    (node: HTMLButtonElement | null) => {
      if (node) {
        mountedCardRef.current = { node, identity: currentIdentity };
      } else if (mountedCardRef.current?.identity === currentIdentity) {
        mountedCardRef.current = null;
      }
      const activePresentation = presentationRef.current;
      if (
        node &&
        preset.reduced &&
        activePresentation &&
        presentationConsumedRef.current &&
        activePresentation.identity !== currentIdentity
      ) {
        node.focus();
        updatePresentation(null);
        interactionLockRef.current = false;
      }
    },
    [currentIdentity, preset.reduced, updatePresentation]
  );

  const finishIncomingPresentation = useCallback(() => {
    const activePresentation = presentationRef.current;
    if (
      !activePresentation ||
      !presentationConsumedRef.current ||
      currentIdentityRef.current === activePresentation.identity
    ) {
      return;
    }
    const mountedCard = mountedCardRef.current;
    if (mountedCard?.identity !== currentIdentityRef.current) {
      return;
    }
    mountedCard.node.focus();
    updatePresentation(null);
    interactionLockRef.current = false;
  }, [updatePresentation]);

  const commitPresentation = useCallback(
    (activePresentation: RatingPresentation) => {
      if (
        presentationConsumedRef.current ||
        presentationRef.current !== activePresentation ||
        activePresentation.phase !== 'exiting' ||
        currentIdentityRef.current !== activePresentation.identity
      ) {
        return;
      }
      presentationConsumedRef.current = true;
      let accepted = true;
      if (activePresentation.quality === null) {
        session.skip();
      } else {
        accepted = session.rateAdvanced(
          activePresentation.quality,
          activePresentation.identity
        );
      }
      if (!accepted) {
        updatePresentation(null);
        interactionLockRef.current = false;
        return;
      }
      onCommitted(activePresentation.quality);
      const willComplete = session.cardStatuses.every(
        (status, index) =>
          index === activePresentation.index || status !== CARD_STATUS.PENDING
      );
      if (willComplete) {
        updatePresentation(null);
        interactionLockRef.current = false;
      }
    },
    [onCommitted, session, updatePresentation]
  );

  const isCurrentCardPending =
    session.cardStatuses[session.currentIndex] === CARD_STATUS.PENDING;
  const beginPresentation = useCallback(
    async (quality: SM2Quality | null, verdict: OutcomeStampVerdict) => {
      if (
        interactionLockRef.current ||
        !isCurrentCardPending ||
        !session.currentCard
      ) {
        return;
      }
      const { artifactId, cardIndex } = session.currentCard;
      const savingPresentation: RatingPresentation = {
        identity: `${artifactId}:${cardIndex}`,
        index: session.currentIndex,
        verdict,
        quality,
        phase: 'saving',
      };
      interactionLockRef.current = true;
      presentationConsumedRef.current = false;
      updatePresentation(savingPresentation);

      if (quality !== null && !readOnly) {
        try {
          await reviewCard({ artifactId, cardIndex, quality });
        } catch {
          if (presentationRef.current === savingPresentation) {
            updatePresentation(null);
            interactionLockRef.current = false;
          }
          onError();
          return;
        }
      }

      if (
        !mountedRef.current ||
        presentationRef.current !== savingPresentation ||
        currentIdentityRef.current !== savingPresentation.identity
      ) {
        if (presentationRef.current === savingPresentation) {
          updatePresentation(null);
          interactionLockRef.current = false;
        }
        return;
      }

      const exitingPresentation: RatingPresentation = {
        ...savingPresentation,
        phase: 'exiting',
      };
      updatePresentation(exitingPresentation);
      if (preset.reduced) {
        commitPresentation(exitingPresentation);
      }
    },
    [
      commitPresentation,
      isCurrentCardPending,
      preset.reduced,
      readOnly,
      reviewCard,
      session.currentCard,
      session.currentIndex,
      onError,
      updatePresentation,
    ]
  );

  const onCardAnimationComplete = useCallback(() => {
    const activePresentation = presentationRef.current;
    if (!activePresentation || activePresentation.phase !== 'exiting') {
      return;
    }
    if (activePresentation.identity === currentIdentity) {
      commitPresentation(activePresentation);
      return;
    }
    finishIncomingPresentation();
  }, [commitPresentation, currentIdentity, finishIncomingPresentation]);

  const isLocked = useCallback(() => interactionLockRef.current, []);
  const reset = useCallback(() => {
    if (interactionLockRef.current) {
      return false;
    }
    setRunKey((value) => value + 1);
    return true;
  }, []);

  const handleNavigate = useCallback(
    (direction: -1 | 1) => {
      if (isLocked()) {
        return;
      }
      const nextIndex = session.currentIndex + direction;
      if (nextIndex >= 0 && nextIndex < session.totalCards) {
        session.navigate(nextIndex);
      }
    },
    [isLocked, session]
  );

  const handleContinue = useCallback(() => {
    if (isLocked()) {
      return;
    }
    const nextIndex = findNextPendingIndex(
      session.cardStatuses,
      session.currentIndex
    );
    if (nextIndex >= 0) {
      session.navigate(nextIndex);
    }
  }, [isLocked, session]);

  const handleRestart = useCallback(
    (filter?: Parameters<typeof session.restart>[0]) => {
      if (!reset()) {
        return;
      }
      session.restart(filter);
    },
    [reset, session]
  );

  const handleReviewSkipped = useCallback(() => {
    if (!isLocked()) {
      session.reviewSkipped();
    }
  }, [isLocked, session]);

  const handleFlip = useCallback(() => {
    if (!isLocked()) {
      session.flip();
    }
  }, [isLocked, session]);

  const currentStatus = session.cardStatuses[session.currentIndex];
  const recordedVerdict: OutcomeStampVerdict | undefined =
    currentStatus === CARD_STATUS.CORRECT ||
    currentStatus === CARD_STATUS.WRONG ||
    currentStatus === CARD_STATUS.SKIPPED
      ? currentStatus
      : undefined;
  const verdict =
    presentation?.identity === currentIdentity
      ? presentation.verdict
      : recordedVerdict;
  const isOutgoing =
    presentation?.identity === currentIdentity &&
    presentation.phase === 'exiting';
  const isIncoming =
    presentation?.phase === 'exiting' &&
    presentation.identity !== currentIdentity;
  const presentationOffset = presentation ? EXIT_X[presentation.verdict] : 0;
  const cardMotion: Pick<
    HTMLMotionProps<'div'>,
    'initial' | 'animate' | 'exit' | 'transition'
  > = {
    initial: preset.reduced
      ? false
      : { opacity: 0, x: !isIncoming ? 0 : -presentationOffset },
    animate: preset.reduced
      ? { opacity: isOutgoing ? 0 : 1, x: 0 }
      : isOutgoing
        ? { opacity: [1, 0], x: [0, presentationOffset] }
        : isIncoming
          ? { opacity: [0, 1], x: [-presentationOffset, 0] }
          : { opacity: 1, x: 0 },
    ...(isOutgoing ? {} : { exit: { opacity: 0 } }),
    transition: isOutgoing
      ? preset.sortExit
      : isIncoming
        ? preset.sortEnter
        : preset.fade,
  };
  const segments = useMemo(() => {
    const nextSegments = toCardSegments(
      session.cardStatuses,
      session.currentIndex,
      session.isComplete
    );
    if (
      presentation?.phase === 'exiting' &&
      presentation.identity === currentIdentity
    ) {
      nextSegments[presentation.index] = presentation.verdict;
    }
    return nextSegments;
  }, [
    presentation,
    currentIdentity,
    session.cardStatuses,
    session.currentIndex,
    session.isComplete,
  ]);

  return {
    presentation,
    runKey,
    isLocked,
    begin: beginPresentation,
    reset,
    actions: {
      navigate: handleNavigate,
      continue: handleContinue,
      restart: handleRestart,
      reviewSkipped: handleReviewSkipped,
      flip: handleFlip,
    },
    cardRef: focusCard,
    onCardAnimationComplete,
    card: { identity: currentIdentity, verdict, motion: cardMotion },
    segments,
  };
}
