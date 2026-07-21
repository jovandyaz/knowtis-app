import { beforeEach, describe, expect, it } from 'vitest';

import { useWorkspaceStore } from './workspace.store';

describe('useWorkspaceStore', () => {
  beforeEach(() => {
    useWorkspaceStore.setState({ activeTab: 'note' });
  });

  it('defaults the active tab to the note', () => {
    expect(useWorkspaceStore.getState().activeTab).toBe('note');
  });

  it('switches the active tab to the study workspace', () => {
    useWorkspaceStore.getState().setTab('estudio');
    expect(useWorkspaceStore.getState().activeTab).toBe('estudio');
  });

  it('switches the active tab back to the note', () => {
    useWorkspaceStore.getState().setTab('estudio');
    useWorkspaceStore.getState().setTab('note');
    expect(useWorkspaceStore.getState().activeTab).toBe('note');
  });
});
