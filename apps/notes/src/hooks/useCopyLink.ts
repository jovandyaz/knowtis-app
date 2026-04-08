import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { toast } from 'sonner';

export function useCopyLink() {
  const { t } = useTranslation('common');
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      toast.success(t('buttons.copied'));
      timeoutRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t('errors.somethingWentWrong'));
    }
  }, [t]);

  return { copied, copy };
}
