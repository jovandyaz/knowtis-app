export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown) {
    const msg =
      typeof body === 'object' && body !== null && 'message' in body
        ? String((body as Record<string, unknown>).message)
        : `API error ${status}`;
    super(msg);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

export class KnowtisApiClient {
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async get<T>(path: string, token: string): Promise<T> {
    return this.request<T>(path, { method: 'GET', token });
  }

  async post<T>(path: string, token: string, body?: unknown): Promise<T> {
    return this.request<T>(path, { method: 'POST', token, body });
  }

  async patch<T>(path: string, token: string, body?: unknown): Promise<T> {
    return this.request<T>(path, { method: 'PATCH', token, body });
  }

  async delete(path: string, token: string): Promise<void> {
    await this.request(path, { method: 'DELETE', token });
  }

  private async request<T>(
    path: string,
    options: { method: string; token: string; body?: unknown }
  ): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${options.token}`,
      'Content-Type': 'application/json',
    };

    const fetchOptions: RequestInit = {
      method: options.method,
      headers,
    };

    if (options.body) {
      fetchOptions.body = JSON.stringify(options.body);
    }

    const res = await fetch(`${this.baseUrl}${path}`, fetchOptions);

    if (!res.ok) {
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        body = { message: res.statusText };
      }
      throw new ApiError(res.status, body);
    }

    if (res.status === 204) {
      return undefined as T;
    }
    return res.json() as Promise<T>;
  }
}
