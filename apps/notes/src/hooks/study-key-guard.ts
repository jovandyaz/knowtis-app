import { STUDY_FOCUS_ATTRIBUTE } from '@/components/artifacts/focus/study-focus-marker';

const DIALOG_OR_MENU_SELECTOR =
  '[role="dialog"], [role="alertdialog"], [aria-modal="true"], [role="menu"]';

function isEditableTarget(target: HTMLElement): boolean {
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.isContentEditable
  );
}

/**
 * True when a study shortcut must not act: editable targets, modified or repeated
 * keys, and any dialog/menu layer other than the study focus overlay itself when
 * `insideFocusDialog` is set (a nested confirmation or menu suspends the shortcuts).
 */
export function isStudyKeyEventIgnored(
  event: KeyboardEvent,
  insideFocusDialog: boolean
): boolean {
  if (
    event.repeat ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey
  ) {
    return true;
  }
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (isEditableTarget(target)) {
    return true;
  }
  const layer = target.closest(DIALOG_OR_MENU_SELECTOR);
  if (!layer) {
    return false;
  }
  return !(insideFocusDialog && layer.hasAttribute(STUDY_FOCUS_ATTRIBUTE));
}
