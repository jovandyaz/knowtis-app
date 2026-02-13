import { useCallback, useState } from 'react';

import { useParams } from '@tanstack/react-router';

import { CollaborativeEditor } from '@/components/editor';
import { Eye, Pencil } from 'lucide-react';

import { ApiClientError } from '@knowtis/api-client';
import { useNoteByToken } from '@knowtis/data-access-notes';
import {
  Badge,
  Button,
  ErrorState,
  LoadingState,
} from '@knowtis/design-system';
import { PERMISSION } from '@knowtis/shared-types';

export function SharedNotePage() {
  const { token } = useParams({ from: '/s/$token' });
  const { data, isLoading, isError, error } = useNoteByToken(token);
  const [isEditing, setIsEditing] = useState(false);
  const [latestContent, setLatestContent] = useState<string | null>(null);

  const handleEditDenied = useCallback(() => {
    setIsEditing(false);
  }, []);

  const handleUpdate = useCallback((content: string) => {
    setLatestContent(content);
  }, []);

  const handleStopEditing = useCallback(() => {
    setIsEditing(false);
  }, []);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingState message="Loading shared note..." />
      </div>
    );
  }

  if (isError) {
    const isNotFound =
      ApiClientError.isApiClientError(error) && error.status === 404;

    return (
      <div className="flex min-h-screen items-center justify-center">
        <ErrorState
          fullHeight={false}
          title={isNotFound ? 'Link Not Found' : 'Something went wrong'}
          message={
            isNotFound
              ? 'This share link does not exist or has been disabled by the owner.'
              : 'Failed to load the shared note. Please try again.'
          }
        />
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const canEdit = data.accessLevel === PERMISSION.EDITOR;
  const displayContent = latestContent ?? data.content;

  return (
    <div className="min-h-screen bg-(--background)">
      {/* Minimal header */}
      <header className="border-b border-(--border) bg-(--card)/50 backdrop-blur-sm">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-(--foreground)">
              Knowtis
            </span>
            <Badge variant={canEdit ? 'default' : 'secondary'}>
              {canEdit ? (
                <span className="flex items-center gap-1">
                  <Pencil className="h-3 w-3" />
                  Editor
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <Eye className="h-3 w-3" />
                  View only
                </span>
              )}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            {canEdit && !isEditing && (
              <Button
                variant="default"
                size="sm"
                onClick={() => setIsEditing(true)}
              >
                <Pencil className="mr-1 h-3 w-3" />
                Edit
              </Button>
            )}
            {isEditing && (
              <Button variant="outline" size="sm" onClick={handleStopEditing}>
                <Eye className="mr-1 h-3 w-3" />
                View
              </Button>
            )}
            <a href="/login">
              <Button variant="outline" size="sm">
                Sign in
              </Button>
            </a>
          </div>
        </div>
      </header>

      {/* Note content */}
      <main className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="mb-2 text-3xl font-bold text-(--foreground)">
          {data.title}
        </h1>

        <div className="mb-8 flex items-center gap-2 text-sm text-(--muted-foreground)">
          <span>By {data.owner.name}</span>
          <span>&middot;</span>
          <span>
            {new Date(data.updatedAt).toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </span>
        </div>

        {isEditing ? (
          <CollaborativeEditor
            noteId={data.id}
            initialContent={data.content}
            onUpdate={handleUpdate}
            editable={true}
            shareToken={token}
            onEditDenied={handleEditDenied}
          />
        ) : (
          <div
            className="prose prose-neutral dark:prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: displayContent }}
          />
        )}
      </main>
    </div>
  );
}
