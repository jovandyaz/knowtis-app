import { useLayoutEffect, useRef } from 'react';

import type { SM2Quality } from '@knowtis/shared-types';

import {
  resolveStudyKeyAction,
  STUDY_KEY_ACTION_TYPES,
} from './study-key-action';
import { isStudyKeyEventIgnored } from './study-key-guard';

export interface StudyKeyboardOptions {
  enabled: boolean;
  /** The listener lives inside the fullscreen study overlay (its own dialog layer is allowed). */
  insideFocusDialog: boolean;
  isAdvancedMode: boolean;
  flipped: boolean;
  isBusy: () => boolean;
  onFlip: () => void;
  onNavigate: (direction: -1 | 1) => void;
  onRate: (quality: SM2Quality) => void;
}

/**
 * Window-level flashcard shortcuts: Space/Enter flip, arrows browse, digits rate a
 * flipped card. Rating keys are ignored until the answer is showing; a focused
 * button keeps its native Space/Enter activation.
 */
export function useStudyKeyboard(options: StudyKeyboardOptions): void {
  const latest = useRef(options);
  useLayoutEffect(() => {
    latest.current = options;
  });

  useLayoutEffect(() => {
    if (!options.enabled) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      const current = latest.current;
      if (
        current.isBusy() ||
        isStudyKeyEventIgnored(event, current.insideFocusDialog)
      ) {
        return;
      }
      const action = resolveStudyKeyAction(event.key, current.isAdvancedMode);
      if (!action) {
        return;
      }
      if (
        action.type === STUDY_KEY_ACTION_TYPES.FLIP &&
        event.target instanceof HTMLButtonElement
      ) {
        return;
      }
      if (action.type === STUDY_KEY_ACTION_TYPES.RATE && !current.flipped) {
        return;
      }
      event.preventDefault();
      switch (action.type) {
        case STUDY_KEY_ACTION_TYPES.FLIP:
          current.onFlip();
          break;
        case STUDY_KEY_ACTION_TYPES.NAVIGATE:
          current.onNavigate(action.direction);
          break;
        case STUDY_KEY_ACTION_TYPES.RATE:
          current.onRate(action.quality);
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [options.enabled]);
}
