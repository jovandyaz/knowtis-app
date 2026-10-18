import { useId, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { useClaimEscape } from '@/hooks/useClaimEscape';
import { toast } from 'sonner';

import {
  MEMORY_EDIT_FAILURE,
  memoryEditFailureOf,
  useEditMemory,
  type MemoryEditFailure,
} from '@knowtis/data-access-agent';
import { Button, LoadingButton, Textarea } from '@knowtis/design-system';
import { MEMORY_MAX_CHARS, type UserMemoryItem } from '@knowtis/shared-types';

const LINE_BREAKS = /[\r\n]+/g;

const FAILURE_MESSAGE_KEY = {
  contentPolicy: 'memory.edit.errors.contentPolicy',
  injection: 'memory.edit.errors.injection',
  rejected: 'memory.edit.errors.rejected',
  rateLimited: 'memory.edit.errors.rateLimited',
  screeningUnavailable: 'memory.edit.errors.screeningUnavailable',
  embeddingsFailed: 'memory.edit.errors.embeddingsFailed',
  embeddingsUnavailable: 'memory.edit.errors.embeddingsUnavailable',
  unavailable: 'memory.edit.errors.unavailable',
  invalid: 'memory.edit.errors.invalid',
  notFound: 'memory.edit.errors.notFound',
  network: 'memory.edit.errors.network',
  failed: 'memory.edit.errors.failed',
} as const satisfies Record<MemoryEditFailure, string>;

interface MemoryEditFormProps {
  memory: UserMemoryItem;
  onClose: () => void;
}

export function MemoryEditForm({ memory, onClose }: MemoryEditFormProps) {
  const { t } = useTranslation('common');
  const [draft, setDraft] = useState(memory.content);
  const [failure, setFailure] = useState<MemoryEditFailure | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const failureMessage = (reason: MemoryEditFailure) =>
    t(FAILURE_MESSAGE_KEY[reason], { max: MEMORY_MAX_CHARS });
  const edit = useEditMemory({
    onSuccess: () => toast.success(t('memory.edit.saved')),
    onError: (error) => {
      const reason = memoryEditFailureOf(error);
      if (reason === MEMORY_EDIT_FAILURE.NOT_FOUND || !formRef.current) {
        toast.error(failureMessage(reason));
      }
    },
  });
  const counterId = useId();
  const errorId = useId();
  const content = draft.trim();
  const canSave =
    content.length > 0 && content !== memory.content && !edit.isPending;

  useClaimEscape(formRef, onClose);

  const save = () => {
    if (!canSave) {
      return;
    }
    setFailure(null);
    edit.mutate(
      { id: memory.id, content },
      {
        onSuccess: onClose,
        onError: (error) => {
          const reason = memoryEditFailureOf(error);
          if (reason === MEMORY_EDIT_FAILURE.NOT_FOUND) {
            onClose();
            return;
          }
          setFailure(reason);
          fieldRef.current?.focus();
        },
      }
    );
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    save();
  };

  return (
    <form ref={formRef} onSubmit={submit} className="space-y-2">
      <Textarea
        ref={fieldRef}
        autoFocus
        rows={3}
        value={draft}
        maxLength={MEMORY_MAX_CHARS}
        aria-label={t('memory.edit.fieldLabel')}
        aria-invalid={failure !== null}
        aria-describedby={failure ? `${errorId} ${counterId}` : counterId}
        onFocus={(event) => {
          const end = event.currentTarget.value.length;
          event.currentTarget.setSelectionRange(end, end);
        }}
        onChange={(event) => {
          setDraft(event.target.value.replace(LINE_BREAKS, ' '));
          setFailure(null);
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || event.nativeEvent.isComposing) {
            return;
          }
          event.preventDefault();
          save();
        }}
        className="resize-none wrap-anywhere aria-invalid:border-(--destructive)"
      />
      {failure ? (
        <p id={errorId} role="alert" className="text-xs text-(--destructive)">
          {failureMessage(failure)}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span
          id={counterId}
          className="text-xs tabular-nums text-(--muted-foreground)"
        >
          {t('memory.edit.counter', {
            count: draft.length,
            max: MEMORY_MAX_CHARS,
          })}
        </span>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            {t('buttons.cancel')}
          </Button>
          <LoadingButton
            type="submit"
            size="sm"
            loading={edit.isPending}
            loadingText={t('states.saving')}
            disabled={!canSave}
          >
            {t('buttons.save')}
          </LoadingButton>
        </div>
      </div>
    </form>
  );
}
