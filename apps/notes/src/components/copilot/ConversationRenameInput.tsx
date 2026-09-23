import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useClaimEscape } from '@/hooks/useClaimEscape';

import { Input } from '@knowtis/design-system';
import {
  isValidConversationTitle,
  normalizeConversationTitle,
} from '@knowtis/shared-types';

/** Enter and Escape leave focus on the field; a blur has already moved it. */
export type RenameExit = 'keyboard' | 'blur';

interface ConversationRenameInputProps {
  title: string;
  onSubmit: (title: string) => void;
  onCancel: (exit: RenameExit) => void;
}

export function ConversationRenameInput({
  title,
  onSubmit,
  onCancel,
}: ConversationRenameInputProps) {
  const { t } = useTranslation('notes');
  const [value, setValue] = useState(title);
  const fieldRef = useRef<HTMLInputElement>(null);
  const settled = useRef(false);
  const valid = isValidConversationTitle(value);

  // Unmounting the focused field can fire a blur after Enter or Escape already
  // ended the edit.
  const settle = (action: () => void) => {
    if (settled.current) {
      return;
    }
    settled.current = true;
    action();
  };

  useClaimEscape(fieldRef, () => settle(() => onCancel('keyboard')));

  return (
    <Input
      ref={fieldRef}
      autoFocus
      value={value}
      aria-label={t('ai.copilot.history.renameLabel')}
      aria-invalid={!valid}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => settle(() => onCancel('blur'))}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' || event.nativeEvent.isComposing) {
          return;
        }
        event.preventDefault();
        if (valid) {
          settle(() => onSubmit(normalizeConversationTitle(value)));
        }
      }}
      className="h-8 aria-invalid:border-(--destructive)"
    />
  );
}
