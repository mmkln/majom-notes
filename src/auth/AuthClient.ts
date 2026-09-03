import { ApiError, getApiErrorMessage } from '../api/ApiError.ts';
import type { AuthUser, SessionResponse } from './types.ts';

const LEGACY_REFRESH_TOKEN_KEY = 'majom-notes:refresh-token:v1';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'TRACE']);

function isAuthUser(value: unknown): value is AuthUser {
  if (!value || typeof value !== 'object') return false;
  const user = value as Partial<AuthUser>;
  return (
    typeof user.id === 'string' &&
    typeof user.email === 'string' &&
    typeof user.username === 'string'
  );
}

function isSessionResponse(value: unknown): value is SessionResponse {
  if (!value || typeof value !== 'object') return false;
  const session = value as Partial<SessionResponse>;
  return (
    session.authenticated === true &&
    isAuthUser(session.user) &&
    typeof session.csrfToken === 'string' &&
    session.csrfToken.length > 0
  );
}

function removeLegacyRefreshToken(): void {
  try {
    window.localStorage.removeItem(LEGACY_REFRESH_TOKEN_KEY);
  } catch {
    // Authentication is backed by an HttpOnly cookie, not browser storage.
  }
}

export class AuthClient {
  private user: AuthUser | null = null;
  private csrfToken: string | null = null;

  constructor(
    private readonly apiUrl: string,
    private readonly appUrl: string,
  ) {}

  public get currentUser(): AuthUser | null {
    return this.user;
  }

  public get isAuthenticated(): boolean {
    return this.user !== null;
  }

  public buildLoginUrl(switchAccount = false): string {
    const query = new URLSearchParams({ return_to: this.appUrl });
    if (switchAccount) query.set('switch', '1');
    return `${this.apiUrl}/auth/sso/login/?${query.toString()}`;
  }

  public startLogin(switchAccount = false): void {
    window.location.assign(this.buildLoginUrl(switchAccount));
  }

  public async restore(): Promise<boolean> {
    const response = await fetch(`${this.apiUrl}/auth/sso/session/`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });

    removeLegacyRefreshToken();
    if (response.status === 401) {
      this.clear();
      return false;
    }

    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      this.clear();
      throw new ApiError(
        response.status,
        payload,
        getApiErrorMessage(payload, 'Не вдалося перевірити сесію входу.'),
      );
    }
    if (!isSessionResponse(payload)) {
      this.clear();
      throw new Error('Сервер повернув некоректну сесію входу.');
    }

    this.user = payload.user;
    this.csrfToken = payload.csrfToken;
    return true;
  }

  public async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.performRequest(path, init);
    if (response.status === 401) this.clear();
    return this.parseResponse<T>(response);
  }

  public async logout(): Promise<void> {
    const csrfToken = this.csrfToken;
    try {
      await fetch(`${this.apiUrl}/auth/sso/logout/`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          ...(csrfToken ? { 'X-CSRFToken': csrfToken } : {}),
        },
      });
    } finally {
      this.clear();
    }
  }

  private performRequest(path: string, init: RequestInit): Promise<Response> {
    const headers = new Headers(init.headers);
    const method = (init.method ?? 'GET').toUpperCase();
    if (!headers.has('Accept')) headers.set('Accept', 'application/json');
    if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    if (!SAFE_METHODS.has(method) && this.csrfToken) {
      headers.set('X-CSRFToken', this.csrfToken);
    }
    return fetch(`${this.apiUrl}${path}`, {
      ...init,
      credentials: 'include',
      headers,
    });
  }

  private async parseResponse<T>(response: Response): Promise<T> {
    if (response.status === 204 || response.status === 205) {
      return undefined as T;
    }
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      throw new ApiError(
        response.status,
        payload,
        getApiErrorMessage(payload, `Помилка запиту (${response.status}).`),
      );
    }
    return payload as T;
  }

  private clear(): void {
    this.user = null;
    this.csrfToken = null;
    removeLegacyRefreshToken();
  }
}
