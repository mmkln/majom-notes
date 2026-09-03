import { ApiError, getApiErrorMessage } from '../api/ApiError.ts';
import { loadRefreshToken, saveRefreshToken } from './tokenStorage.ts';
import type { AuthUser, RefreshResponse, TokenSessionResponse } from './types.ts';

type IdentityResponse = { user: AuthUser };

function isAuthUser(value: unknown): value is AuthUser {
  if (!value || typeof value !== 'object') return false;
  const user = value as Partial<AuthUser>;
  return typeof user.id === 'string' && typeof user.email === 'string';
}

function isTokenSession(value: unknown): value is TokenSessionResponse {
  if (!value || typeof value !== 'object') return false;
  const session = value as Partial<TokenSessionResponse>;
  return (
    isAuthUser(session.user) &&
    typeof session.access === 'string' &&
    session.access.length > 0 &&
    typeof session.refresh === 'string' &&
    session.refresh.length > 0
  );
}

function isRefreshResponse(value: unknown): value is RefreshResponse {
  if (!value || typeof value !== 'object') return false;
  const response = value as Partial<RefreshResponse>;
  return (
    typeof response.access === 'string' &&
    response.access.length > 0 &&
    (response.refresh === undefined ||
      (typeof response.refresh === 'string' && response.refresh.length > 0))
  );
}

export class AuthClient {
  private accessToken: string | null = null;
  private refreshToken: string | null = loadRefreshToken();
  private refreshPromise: Promise<string> | null = null;
  private user: AuthUser | null = null;

  constructor(
    private readonly apiUrl: string,
    private readonly appUrl: string,
  ) {}

  public get currentUser(): AuthUser | null {
    return this.user;
  }

  public get isAuthenticated(): boolean {
    return this.user !== null && this.accessToken !== null;
  }

  public buildLoginUrl(switchAccount = false): string {
    const query = new URLSearchParams({
      flow: 'token',
      return_to: this.appUrl,
    });
    if (switchAccount) query.set('switch', '1');
    return `${this.apiUrl}/auth/sso/login/?${query.toString()}`;
  }

  public startLogin(switchAccount = false): void {
    window.location.assign(this.buildLoginUrl(switchAccount));
  }

  public async restore(): Promise<boolean> {
    const callback = this.consumeSsoFragment();
    if (callback.error) {
      this.clear();
      return false;
    }

    if (callback.code) {
      try {
        await this.exchange(callback.code);
        return true;
      } catch (error) {
        this.clear();
        throw error;
      }
    }

    if (!this.refreshToken) return false;

    try {
      await this.refreshAccessToken();
      await this.loadIdentity();
      return true;
    } catch {
      this.clear();
      return false;
    }
  }

  public async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    let response = await this.performRequest(path, init);
    if (response.status === 401 && this.refreshToken) {
      try {
        await this.refreshAccessToken();
      } catch (error) {
        this.clear();
        throw error;
      }
      response = await this.performRequest(path, init);
    }
    return this.parseResponse<T>(response);
  }

  public async logout(): Promise<void> {
    const refresh = this.refreshToken;
    this.clear();
    if (!refresh) return;

    await fetch(`${this.apiUrl}/auth/token/blacklist/`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refresh }),
    }).catch(() => undefined);
  }

  private consumeSsoFragment(): { code: string | null; error: string | null } {
    const query = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const code = query.get('sso_code');
    const error = query.get('sso_error');
    if (code || error) {
      window.history.replaceState(
        null,
        document.title,
        `${window.location.pathname}${window.location.search}`,
      );
    }
    return { code, error };
  }

  private async exchange(code: string): Promise<void> {
    const response = await fetch(`${this.apiUrl}/auth/sso/exchange/`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ code }),
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      throw new ApiError(
        response.status,
        payload,
        getApiErrorMessage(payload, 'Не вдалося завершити вхід.'),
      );
    }
    if (!isTokenSession(payload)) {
      throw new Error('Сервер повернув некоректну сесію входу.');
    }

    this.user = payload.user;
    this.accessToken = payload.access;
    this.setRefreshToken(payload.refresh);
  }

  private async refreshAccessToken(): Promise<string> {
    if (!this.refreshToken) throw new Error('Потрібна авторизація.');
    if (this.refreshPromise) return this.refreshPromise;

    const refresh = this.refreshToken;
    this.refreshPromise = (async () => {
      const response = await fetch(`${this.apiUrl}/auth/token/refresh/`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        throw new ApiError(
          response.status,
          payload,
          getApiErrorMessage(payload, 'Сесію завершено. Увійдіть знову.'),
        );
      }
      if (!isRefreshResponse(payload)) {
        throw new Error('Сервер повернув некоректне оновлення сесії.');
      }

      this.accessToken = payload.access;
      if (payload.refresh) this.setRefreshToken(payload.refresh);
      return payload.access;
    })();

    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async loadIdentity(): Promise<void> {
    const response = await this.performRequest('/auth/sso/me/', {});
    const identity = await this.parseResponse<IdentityResponse>(response);
    if (!isAuthUser(identity.user)) {
      throw new Error('Сервер повернув некоректний профіль.');
    }
    this.user = identity.user;
  }

  private performRequest(path: string, init: RequestInit): Promise<Response> {
    const headers = new Headers(init.headers);
    if (!headers.has('Accept')) headers.set('Accept', 'application/json');
    if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    if (this.accessToken) {
      headers.set('Authorization', `Bearer ${this.accessToken}`);
    }
    return fetch(`${this.apiUrl}${path}`, { ...init, headers });
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

  private setRefreshToken(token: string | null): void {
    this.refreshToken = token;
    saveRefreshToken(token);
  }

  private clear(): void {
    this.user = null;
    this.accessToken = null;
    this.setRefreshToken(null);
  }
}
