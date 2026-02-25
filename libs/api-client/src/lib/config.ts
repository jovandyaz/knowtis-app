import { DEFAULT_LOCALE, I18N_STORAGE_KEY } from '@knowtis/shared-i18n';

export interface ApiClientConfig {
  baseUrl: string;
  timeout?: number;
  localeProvider?: () => string;
}

export const DEFAULT_API_CONFIG: ApiClientConfig = {
  baseUrl: import.meta.env?.['VITE_API_URL'] || 'http://localhost:3333/api/v1',
  timeout: 30000,
  localeProvider: () =>
    typeof window !== 'undefined'
      ? localStorage.getItem(I18N_STORAGE_KEY) || DEFAULT_LOCALE
      : DEFAULT_LOCALE,
};
