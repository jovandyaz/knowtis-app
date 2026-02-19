import { logger } from '@knowtis/shared-util';

import { DEFAULT_API_CONFIG, type ApiClientConfig } from './config';

type RequestMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface RequestOptions {
  headers?: Record<string, string>;
  signal?: AbortSignal;
  skipAuth?: boolean;
}

export interface FieldError {
  field: string;
  message: string;
}

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  readonly errors: FieldError[] | undefined;

  constructor(
    message: string,
    status: number,
    code?: string,
    errors?: FieldError[]
  ) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.errors = errors;
  }

  static isApiClientError(error: unknown): error is ApiClientError {
    return error instanceof ApiClientError;
  }
}

type TokenRefreshCallback = () => Promise<string | null>;

export interface TokenProvider {
  getAccessToken(): string | null;
  clearTokens(): void;
}

export interface IHttpClient {
  setTokenProvider(provider: TokenProvider): void;
  setRefreshTokenCallback(callback: TokenRefreshCallback): void;
  request<T>(
    method: RequestMethod,
    endpoint: string,
    data?: unknown,
    options?: RequestOptions
  ): Promise<T>;
  get<T>(endpoint: string, options?: RequestOptions): Promise<T>;
  post<T>(
    endpoint: string,
    data?: unknown,
    options?: RequestOptions
  ): Promise<T>;
  put<T>(
    endpoint: string,
    data?: unknown,
    options?: RequestOptions
  ): Promise<T>;
  patch<T>(
    endpoint: string,
    data?: unknown,
    options?: RequestOptions
  ): Promise<T>;
  delete<T>(endpoint: string, options?: RequestOptions): Promise<T>;
}

export class HttpClient implements IHttpClient {
  private config: ApiClientConfig;
  private refreshTokenCallback?: TokenRefreshCallback;
  private tokenProvider: TokenProvider = {
    getAccessToken: () => null,
    clearTokens: () => {},
  };
  private isRefreshing = false;
  private refreshPromise: Promise<string | null> | null = null;

  constructor(config: Partial<ApiClientConfig> = {}) {
    this.config = { ...DEFAULT_API_CONFIG, ...config };
  }

  setTokenProvider(provider: TokenProvider): void {
    this.tokenProvider = provider;
  }

  setRefreshTokenCallback(callback: TokenRefreshCallback): void {
    this.refreshTokenCallback = callback;
  }

  private handleAuthFailure(): void {
    this.tokenProvider.clearTokens();
  }

  async request<T>(
    method: RequestMethod,
    endpoint: string,
    data?: unknown,
    options: RequestOptions = {}
  ): Promise<T> {
    const url = `${this.config.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (!options.skipAuth) {
      const token = this.tokenProvider.getAccessToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }

    const fetchOptions: RequestInit = {
      method,
      headers,
      signal: options.signal ?? null,
    };

    if (data && method !== 'GET') {
      fetchOptions.body = JSON.stringify(data);
    }

    try {
      let response = await fetch(url, fetchOptions);

      if (response.status === 401 && !options.skipAuth) {
        if (this.refreshTokenCallback) {
          const newToken = await this.handleTokenRefresh();
          if (newToken) {
            headers['Authorization'] = `Bearer ${newToken}`;
            response = await fetch(url, { ...fetchOptions, headers });
          } else {
            this.handleAuthFailure();
            throw new ApiClientError('Unauthorized', 401, 'UNAUTHORIZED');
          }
        } else {
          this.handleAuthFailure();
          throw new ApiClientError('Unauthorized', 401, 'UNAUTHORIZED');
        }

        if (response.status === 401) {
          this.handleAuthFailure();
          throw new ApiClientError('Unauthorized', 401, 'UNAUTHORIZED');
        }
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));

        const message = Array.isArray(errorData.message)
          ? errorData.message.join('. ')
          : errorData.message ||
            `Request failed with status ${response.status}`;

        const fieldErrors: FieldError[] | undefined =
          Array.isArray(errorData.errors) && errorData.errors.length > 0
            ? errorData.errors
            : undefined;

        throw new ApiClientError(
          message,
          response.status,
          errorData.code,
          fieldErrors
        );
      }

      if (response.status === 204) {
        return {} as T;
      }

      return response.json();
    } catch (error) {
      if (error instanceof ApiClientError) {
        throw error;
      }

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new ApiClientError('Request was cancelled', 0, 'ABORTED');
        }
        throw new ApiClientError(error.message, 0, 'NETWORK_ERROR');
      }

      throw new ApiClientError('An unexpected error occurred', 0, 'UNKNOWN');
    }
  }

  private async handleTokenRefresh(): Promise<string | null> {
    if (this.isRefreshing && this.refreshPromise) {
      return this.refreshPromise;
    }

    if (!this.refreshTokenCallback) {
      this.isRefreshing = false;
      return null;
    }

    this.isRefreshing = true;
    this.refreshPromise = this.refreshTokenCallback();

    try {
      const newToken = await this.refreshPromise;
      return newToken;
    } catch (error) {
      logger.error('Token refresh failed', { error, context: 'HttpClient' });
      return null;
    } finally {
      this.isRefreshing = false;
      this.refreshPromise = null;
    }
  }

  get<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    return this.request<T>('GET', endpoint, undefined, options);
  }

  post<T>(
    endpoint: string,
    data?: unknown,
    options?: RequestOptions
  ): Promise<T> {
    return this.request<T>('POST', endpoint, data, options);
  }

  put<T>(
    endpoint: string,
    data?: unknown,
    options?: RequestOptions
  ): Promise<T> {
    return this.request<T>('PUT', endpoint, data, options);
  }

  patch<T>(
    endpoint: string,
    data?: unknown,
    options?: RequestOptions
  ): Promise<T> {
    return this.request<T>('PATCH', endpoint, data, options);
  }

  delete<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    return this.request<T>('DELETE', endpoint, undefined, options);
  }
}

export const httpClient = new HttpClient();
