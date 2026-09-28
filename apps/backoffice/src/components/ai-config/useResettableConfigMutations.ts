import { useResetAiConfig, useSetAiConfig } from '@knowtis/data-access-admin';

/**
 * `useSetAiConfig` and `useResetAiConfig` are independent mutations: each
 * clears its own error only when it runs again, never when its sibling does.
 * Resetting the sibling before `mutate` keeps a combined alert
 * (`setConfig.error ?? resetConfig.error`) reflecting only the latest action.
 */
export function useResettableConfigMutations() {
  const setConfig = useSetAiConfig();
  const resetConfig = useResetAiConfig();

  return {
    setConfig: {
      ...setConfig,
      mutate: (...args: Parameters<typeof setConfig.mutate>) => {
        resetConfig.reset();
        setConfig.mutate(...args);
      },
    },
    resetConfig: {
      ...resetConfig,
      mutate: (...args: Parameters<typeof resetConfig.mutate>) => {
        setConfig.reset();
        resetConfig.mutate(...args);
      },
    },
  };
}
