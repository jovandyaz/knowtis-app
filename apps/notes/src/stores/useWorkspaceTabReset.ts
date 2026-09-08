import { useEffect } from 'react';

import { useWorkspaceStore } from './workspace.store';

export function useWorkspaceTabReset(noteKey: string): void {
  const setTab = useWorkspaceStore((s) => s.setTab);

  useEffect(() => {
    setTab('note');
  }, [noteKey, setTab]);
}
