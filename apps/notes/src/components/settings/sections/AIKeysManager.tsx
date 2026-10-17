import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  useDeleteProviderKey,
  useProviderKeys,
  useSetProviderKey,
} from '@/hooks';
import { useVerifyEmailGate } from '@/hooks/useVerifyEmailGate';
import { PROVIDER_LABEL } from '@/lib/ai/provider-labels';

import { Button, PasswordInput } from '@knowtis/design-system';
import { BYOK_PROVIDERS, type ByokProvider } from '@knowtis/shared-types';
import { formatKeyHint, formatRelativeTime } from '@knowtis/shared-util';

import { SectionHeader } from '../SectionHeader';

interface AIKeysManagerProps {
  focusFirstField?: boolean;
}

export function AIKeysManager({ focusFirstField = false }: AIKeysManagerProps) {
  const { t, i18n } = useTranslation('common');
  const { data: keys } = useProviderKeys(true);
  const setKey = useSetProviderKey();
  const removeKey = useDeleteProviderKey();
  const verifyEmailGate = useVerifyEmailGate();
  const [drafts, setDrafts] = useState<Partial<Record<ByokProvider, string>>>(
    {}
  );
  // The gate owns the verdict on its own refusal; this only remembers the
  // failures it left to us, so a gated account is never told its key is bad.
  const [rejectedKeyProvider, setRejectedKeyProvider] =
    useState<ByokProvider | null>(null);
  const firstField = useRef<HTMLInputElement>(null);
  const dateFormats = useMemo(
    () => ({
      sameYear: new Intl.DateTimeFormat(i18n.language, {
        day: 'numeric',
        month: 'short',
      }),
      otherYear: new Intl.DateTimeFormat(i18n.language, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }),
    }),
    [i18n.language]
  );
  const formatAdded = (iso: string) => {
    const added = new Date(iso);
    const format =
      added.getFullYear() === new Date().getFullYear()
        ? dateFormats.sameYear
        : dateFormats.otherYear;
    return format.format(added);
  };

  useEffect(() => {
    if (focusFirstField) {
      firstField.current?.focus();
    }
  }, [focusFirstField]);

  return (
    <section className="space-y-4">
      <SectionHeader
        title={t('aiAssistant.byok.title')}
        description={t('aiAssistant.byok.description')}
      />
      <div className="space-y-4">
        {BYOK_PROVIDERS.map((provider, index) => {
          const stored = keys?.find((k) => k.provider === provider);
          const draft = drafts[provider] ?? '';
          return (
            <div key={provider} className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">
                  {PROVIDER_LABEL[provider]}
                </span>
                {stored ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeKey.mutate(provider)}
                  >
                    {t('aiAssistant.byok.remove')}
                  </Button>
                ) : null}
              </div>
              {stored ? (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  <span className="rounded bg-(--muted) px-1.5 py-0.5 font-mono text-xs break-all">
                    {formatKeyHint(stored.keyPrefix, stored.keySuffix)}
                  </span>
                  <span className="text-(--muted-foreground)">
                    {t('aiAssistant.byok.added', {
                      date: formatAdded(stored.keyStoredAt),
                    })}
                  </span>
                  <span className="text-(--muted-foreground)">
                    {stored.lastUsedAt
                      ? t('aiAssistant.byok.lastUsed', {
                          when: formatRelativeTime(
                            new Date(stored.lastUsedAt),
                            i18n.language
                          ),
                        })
                      : t('aiAssistant.byok.neverUsed')}
                  </span>
                </div>
              ) : null}
              <div className="flex gap-2">
                <PasswordInput
                  ref={index === 0 ? firstField : undefined}
                  value={draft}
                  autoComplete="new-password"
                  data-1p-ignore
                  data-lpignore="true"
                  data-bwignore
                  placeholder={
                    stored
                      ? t('aiAssistant.byok.replacePlaceholder')
                      : t('aiAssistant.byok.placeholder', {
                          provider: PROVIDER_LABEL[provider],
                        })
                  }
                  onChange={(e) =>
                    setDrafts((d) => ({ ...d, [provider]: e.target.value }))
                  }
                />
                <Button
                  disabled={
                    !draft.trim() ||
                    (setKey.isPending &&
                      setKey.variables?.provider === provider)
                  }
                  onClick={() => {
                    setRejectedKeyProvider(null);
                    setKey.mutate(
                      { provider, apiKey: draft.trim() },
                      {
                        onSuccess: () =>
                          setDrafts((d) => ({ ...d, [provider]: '' })),
                        onError: (error: unknown) => {
                          if (!verifyEmailGate.handleError(error)) {
                            setRejectedKeyProvider(provider);
                          }
                        },
                      }
                    );
                  }}
                >
                  {setKey.isPending && setKey.variables?.provider === provider
                    ? t('aiAssistant.byok.saving')
                    : t('aiAssistant.byok.save')}
                </Button>
              </div>
              {rejectedKeyProvider === provider ? (
                <p className="text-xs text-(--destructive)">
                  {t('aiAssistant.byok.invalid')}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
