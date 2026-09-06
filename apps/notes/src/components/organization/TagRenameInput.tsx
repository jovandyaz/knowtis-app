import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Input } from '@knowtis/design-system';
import {
  TAG_SEGMENT_MAX_LENGTH,
  TAG_SEGMENT_PATTERN,
} from '@knowtis/shared-types';

type RenameError = 'invalidSegment' | 'conflict';

interface TagRenameInputProps {
  segment: string;
  /** Lowercased sibling segments, so a rename cannot collide before it is sent. */
  siblings: string[];
  onCommit: (segment: string) => void;
  onCancel: () => void;
}

function validate(
  candidate: string,
  siblings: string[]
): RenameError | undefined {
  if (
    candidate.length === 0 ||
    candidate.length > TAG_SEGMENT_MAX_LENGTH ||
    !TAG_SEGMENT_PATTERN.test(candidate)
  ) {
    return 'invalidSegment';
  }
  return siblings.includes(candidate) ? 'conflict' : undefined;
}

export function TagRenameInput({
  segment,
  siblings,
  onCommit,
  onCancel,
}: TagRenameInputProps) {
  const { t } = useTranslation('notes');
  const [value, setValue] = useState(segment);
  const [error, setError] = useState<RenameError>();
  const settled = useRef(false);
  const errorId = useId();

  const settle = (action: () => void) => {
    if (settled.current) {
      return;
    }
    settled.current = true;
    action();
  };

  const candidateOf = () => value.trim().toLowerCase();

  const submit = () => {
    const candidate = candidateOf();
    if (candidate === segment) {
      settle(onCancel);
      return;
    }

    const failure = validate(candidate, siblings);
    if (failure) {
      setError(failure);
      return;
    }
    settle(() => onCommit(candidate));
  };

  // Leaving the row abandons an edit the server would reject; only Enter is
  // worth an error message, since the field is still there to correct.
  const handleBlur = () => {
    const candidate = candidateOf();
    if (candidate === segment || validate(candidate, siblings)) {
      settle(onCancel);
      return;
    }
    settle(() => onCommit(candidate));
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <Input
        autoFocus
        value={value}
        aria-label={t('organization.tags.renameLabel', { tag: segment })}
        aria-invalid={error !== undefined}
        {...(error ? { 'aria-describedby': errorId } : {})}
        onChange={(event) => {
          setValue(event.target.value);
          setError(undefined);
        }}
        onBlur={handleBlur}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
            event.preventDefault();
            submit();
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            settle(onCancel);
          }
        }}
        className="h-8"
      />
      {error && (
        <p
          id={errorId}
          role="alert"
          className="px-1 text-xs text-(--destructive)"
        >
          {t(`organization.tags.${error}`, {
            length: TAG_SEGMENT_MAX_LENGTH,
            segment: candidateOf(),
          })}
        </p>
      )}
    </div>
  );
}
