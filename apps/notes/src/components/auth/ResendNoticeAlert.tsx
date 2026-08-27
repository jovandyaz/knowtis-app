import { cn } from '@knowtis/design-system';

import type { ResendNotice } from './useVerifyEmailCodeForm';

const TONE_CLASS = {
  success: 'bg-(--primary)/10 text-(--primary)',
  error: 'bg-(--destructive)/10 text-(--destructive)',
} as const satisfies Record<ResendNotice['tone'], string>;

export function ResendNoticeAlert({
  notice,
}: {
  notice: ResendNotice | undefined;
}) {
  if (!notice) {
    return null;
  }

  return (
    <p
      role="alert"
      aria-live="polite"
      className={cn(
        'rounded-md p-3 text-center text-sm',
        TONE_CLASS[notice.tone]
      )}
    >
      {notice.message}
    </p>
  );
}
