import { useSyncExternalStore } from 'react';

import { THEMES } from '@knowtis/design-system';

const CLASS_ATTRIBUTE = 'class';

function subscribe(onStoreChange: () => void) {
  const observer = new MutationObserver(onStoreChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: [CLASS_ATTRIBUTE],
  });
  return () => observer.disconnect();
}

function getSnapshot() {
  return document.documentElement.classList.contains(THEMES.DARK);
}

function getServerSnapshot() {
  return false;
}

/**
 * Tracks the theme the app resolved onto `<html>`, without depending on the
 * theme provider — the class is the only signal shared across packages.
 */
export function useDocumentDarkTheme(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
