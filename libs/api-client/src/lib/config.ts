export interface ApiClientConfig {
  baseUrl: string;
  timeout?: number;
}

export const DEFAULT_API_CONFIG: ApiClientConfig = {
  baseUrl: import.meta.env?.['VITE_API_URL'] || 'http://localhost:3333/api/v1',
  timeout: 30000,
};
