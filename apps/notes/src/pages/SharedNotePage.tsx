import { useParams } from '@tanstack/react-router';

import { Eye, Pencil } from 'lucide-react';

import { ApiClientError } from '@knowtis/api-client';
import { useNoteByToken } from '@knowtis/data-access-notes';
import {
  Badge,
  Button,
  ErrorState,
  LoadingState,
} from '@knowtis/design-system';

export function SharedNotePage() {
  const { token } = useParams({ from: '/s/$token' });
  const { data, isLoading, isError, error } = useNoteByToken(token);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingState message="Loading shared note..." />
      </div>
    );
  }

  if (isError) {
    const isExpired =
      ApiClientError.isApiClientError(error) && error.status === 410;
    const isNotFound =
      ApiClientError.isApiClientError(error) && error.status === 404;

    return (
      <div className="flex min-h-screen items-center justify-center">
        <ErrorState
          fullHeight={false}
          title={
            isExpired
              ? 'Link Expired'
              : isNotFound
                ? 'Link Not Found'
                : 'Something went wrong'
          }
          message={
            isExpired
              ? 'This share link has expired and is no longer valid.'
              : isNotFound
                ? 'This share link does not exist or has been revoked.'
                : 'Failed to load the shared note. Please try again.'
          }
        />
      </div>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <div className="min-h-screen bg-(--background)">
      {/* Minimal header */}
      <header className="border-b border-(--border) bg-(--card)/50 backdrop-blur-sm">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-(--foreground)">
              Knowtis
            </span>
            <Badge
              variant={data.accessLevel === 'editor' ? 'default' : 'secondary'}
            >
              {data.accessLevel === 'editor' ? (
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
          <a href="/login">
            <Button variant="outline" size="sm">
              Sign in
            </Button>
          </a>
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

        <div
          className="prose prose-neutral dark:prose-invert max-w-none"
          dangerouslySetInnerHTML={{ __html: data.content }}
        />
      </main>
    </div>
  );
}
