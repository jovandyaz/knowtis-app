import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  useDeleteProviderKey,
  useProviderKeys,
  useSetProviderKey,
} from '@/hooks';
import { useVerifyEmailGate } from '@/hooks/useVerifyEmailGate';

import { Button, PasswordInput } from '@knowtis/design-system';
import { BYOK_PROVIDERS, type ByokProvider } from '@knowtis/shared-types';
import { formatRelativeTime } from '@knowtis/shared-util';

import { SectionHeader } from '../SectionHeader';

const PROVIDER_LABEL: Record<ByokProvider, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google',
  openrouter: 'OpenRouter',
};

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
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  {PROVIDER_LABEL[provider]}
                </span>
                {stored ? (
                  <span className="text-xs text-(--muted-foreground)">
                    {t('aiAssistant.byok.stored', { prefix: stored.keyPrefix })}
                  </span>
                ) : null}
              </div>
              {stored ? (
                <p className="text-xs text-(--muted-foreground)">
                  {stored.lastUsedAt
                    ? t('aiAssistant.byok.lastUsed', {
                        when: formatRelativeTime(
                          new Date(stored.lastUsedAt),
                          i18n.language
                        ),
                      })
                    : t('aiAssistant.byok.neverUsed')}
                </p>
              ) : null}
              <div className="flex gap-2">
                <PasswordInput
                  ref={index === 0 ? firstField : undefined}
                  value={draft}
                  placeholder={t('aiAssistant.byok.placeholder', {
                    provider: PROVIDER_LABEL[provider],
                  })}
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
                {stored ? (
                  <Button
                    variant="ghost"
                    onClick={() => removeKey.mutate(provider)}
                  >
                    {t('aiAssistant.byok.remove')}
                  </Button>
                ) : null}
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
