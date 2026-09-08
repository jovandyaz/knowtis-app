import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ensureGuestSession } from '@/auth/setup';
import { useWorkspaceStore } from '@/stores/workspace.store';
import { toast } from 'sonner';

interface SharedNoteEditing {
  isEditing: boolean;
  isPreparingEdit: boolean;
  latestContent: string | null;
  handleStartEditing: () => void;
  handleStopEditing: () => void;
  handleEditDenied: () => void;
  handleUpdate: (content: string) => void;
}

/**
 * Promotes a read-only shared note to a collaborative one for a visitor, and
 * keeps the workspace on the note tab across every transition so the editor is
 * never toggled behind a hidden panel.
 */
export function useSharedNoteEditing(): SharedNoteEditing {
  const { t } = useTranslation('notes');
  const setWorkspaceTab = useWorkspaceStore((s) => s.setTab);
  const [isEditing, setIsEditing] = useState(false);
  const [isPreparingEdit, setIsPreparingEdit] = useState(false);
  const [latestContent, setLatestContent] = useState<string | null>(null);

  const handleEditDenied = useCallback(() => {
    toast.error(t('shared.editDenied'));
  }, [t]);

  const handleStartEditing = useCallback(() => {
    setIsPreparingEdit(true);
    void ensureGuestSession()
      .then((ready) => {
        if (ready) {
          setWorkspaceTab('note');
          setIsEditing(true);
          return;
        }
        toast.error(t('shared.editUnavailable'));
      })
      .finally(() => setIsPreparingEdit(false));
  }, [t, setWorkspaceTab]);

  const handleStopEditing = useCallback(() => {
    setWorkspaceTab('note');
    setIsEditing(false);
  }, [setWorkspaceTab]);

  const handleUpdate = useCallback((content: string) => {
    setLatestContent(content);
  }, []);

  return {
    isEditing,
    isPreparingEdit,
    latestContent,
    handleStartEditing,
    handleStopEditing,
    handleEditDenied,
    handleUpdate,
  };
}
