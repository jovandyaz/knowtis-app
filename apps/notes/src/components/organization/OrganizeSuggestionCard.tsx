import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Link } from '@tanstack/react-router';

import { ROUTES } from '@/config';
import { Hash, Sparkles, X } from 'lucide-react';

import { useUpdateNote } from '@knowtis/data-access-notes';
import { Button } from '@knowtis/design-system';
import type { OrganizationSuggestion } from '@knowtis/shared-types';

import { BucketDot } from './BucketDot';

const CHIP_BASE =
  'inline-flex min-h-11 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[13px] transition-colors cursor-pointer md:min-h-0';
const CHIP_ACCEPTED = 'border-border/60 bg-muted/25 text-foreground';
const CHIP_REJECTED =
  'border-dashed border-border/40 text-muted-foreground/60 line-through';

interface OrganizeSuggestionCardProps {
  suggestion: OrganizationSuggestion;
  currentTags: string[];
  onDismiss: () => void;
}

export function OrganizeSuggestionCard({
  suggestion,
  currentTags,
  onDismiss,
}: OrganizeSuggestionCardProps) {
  const { t } = useTranslation('notes');
  const { mutate: updateNote, isPending } = useUpdateNote();
  const [bucketAccepted, setBucketAccepted] = useState(true);
  const [rejectedTags, setRejectedTags] = useState<Set<string>>(new Set());

  const acceptedTags = suggestion.tags
    .map((tag) => tag.path)
    .filter((path) => !rejectedTags.has(path) && !currentTags.includes(path));
  const movesBucket = bucketAccepted && suggestion.bucket !== null;
  const hasSomethingToApply = movesBucket || acceptedTags.length > 0;

  const toggleTag = (path: string) =>
    setRejectedTags((previous) => {
      const next = new Set(previous);
      if (!next.delete(path)) {
        next.add(path);
      }
      return next;
    });

  const apply = () => {
    updateNote(
      {
        id: suggestion.noteId,
        input: {
          ...(movesBucket ? { bucket: suggestion.bucket } : {}),
          ...(acceptedTags.length
            ? { tags: [...currentTags, ...acceptedTags] }
            : {}),
        },
      },
      { onSuccess: onDismiss }
    );
  };

  return (
    <section
      aria-label={t('organization.suggestion.title')}
      className="mb-6 rounded-lg border border-border/60 bg-muted/15 p-3"
    >
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="size-3.5 text-primary" aria-hidden />
        <span className="text-[13px] font-medium">
          {t('organization.suggestion.title')}
        </span>
        <span className="text-xs text-muted-foreground/70">
          {t('organization.suggestion.subtitle')}
        </span>
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t('organization.suggestion.dismiss')}
          className="ml-auto rounded p-1 text-muted-foreground/60 transition-colors hover:text-foreground cursor-pointer"
        >
          <X className="size-3.5" />
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {suggestion.bucket && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground/70">
              {t('organization.suggestion.moveTo')}
            </span>
            <button
              type="button"
              aria-pressed={bucketAccepted}
              onClick={() => setBucketAccepted((accepted) => !accepted)}
              className={`${CHIP_BASE} ${bucketAccepted ? CHIP_ACCEPTED : CHIP_REJECTED}`}
            >
              <BucketDot bucket={suggestion.bucket} />
              {t(`organization.buckets.${suggestion.bucket}`)}
            </button>
          </div>
        )}

        {suggestion.tags.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground/70">
              {t('organization.suggestion.tags')}
            </span>
            {suggestion.tags.map((tag) => {
              const accepted = !rejectedTags.has(tag.path);
              return (
                <button
                  key={tag.path}
                  type="button"
                  aria-pressed={accepted}
                  onClick={() => toggleTag(tag.path)}
                  className={`${CHIP_BASE} ${accepted ? CHIP_ACCEPTED : CHIP_REJECTED}`}
                >
                  <Hash className="size-3 opacity-60" />
                  {tag.path}
                  {tag.isNew && (
                    <span className="text-[11px] text-muted-foreground/60">
                      {t('organization.suggestion.newTag')}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {suggestion.relatedNotes.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground/70">
              {t('organization.suggestion.related')}
            </span>
            {suggestion.relatedNotes.map((note) => (
              <Link
                key={note.id}
                to={ROUTES.NOTE}
                params={{ noteId: note.id }}
                className="text-[13px] text-muted-foreground underline-offset-4 transition-colors hover:text-primary hover:underline"
              >
                {note.title}
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Button
          size="sm"
          onClick={apply}
          disabled={!hasSomethingToApply || isPending}
        >
          {t('organization.suggestion.apply')}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDismiss}>
          {t('organization.suggestion.dismiss')}
        </Button>
      </div>
    </section>
  );
}
