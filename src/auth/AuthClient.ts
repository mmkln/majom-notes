import { ApiError, getApiErrorMessage } from "../api/ApiError.ts";
import type {
  AuthUser,
  IdentityResponse,
  TokenRefreshResponse,
  TokenSessionResponse,
} from "./types.ts";

const REFRESH_TOKEN_KEY = "majom-notes:refresh-token:v1";

function isAuthUser(value: unknown): value is AuthUser {
  if (!value || typeof value !== "object") return false;
  const user = value as Partial<AuthUser>;
  return (
    typeof user.id === "string" &&
    typeof user.email === "string" &&
    typeof user.username === "string"
  );
}

function isTokenSessionResponse(value: unknown): value is TokenSessionResponse {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<TokenSessionResponse>;
  return (
    isAuthUser(session.user) &&
    typeof session.access === "string" &&
    session.access.length > 0 &&
    typeof session.refresh === "string" &&
    session.refresh.length > 0
  );
}

function isIdentityResponse(value: unknown): value is IdentityResponse {
  return Boolean(
    value &&
    typeof value === "object" &&
    isAuthUser((value as Partial<IdentityResponse>).user),
  );
}

function isTokenRefreshResponse(value: unknown): value is TokenRefreshResponse {
  if (!value || typeof value !== "object") return false;
  const response = value as Partial<TokenRefreshResponse>;
  return typeof response.access === "string" && response.access.length > 0;
}

function readRefreshToken(): string | null {
  try {
    return window.localStorage.getItem(REFRESH_TOKEN_KEY);
  } catch {
    return null;
  }
}

function storeRefreshToken(token: string | null): void {
  try {
    if (token) window.localStorage.setItem(REFRESH_TOKEN_KEY, token);
    else window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  } catch {
    // The active access token remains usable until the next reload.
  }
}

export class AuthClient {
  private user: AuthUser | null = null;
  private accessToken: string | null = null;
  private refreshToken: string | null = readRefreshToken();

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
    const query = new URLSearchParams({
      flow: "token",
      return_to: this.appUrl,
    });
    if (switchAccount) query.set("switch", "1");
    return `${this.apiUrl}/auth/sso/login/?${query.toString()}`;
  }

  public startLogin(switchAccount = false): void {
    window.location.assign(this.buildLoginUrl(switchAccount));
  }

  public async restore(): Promise<boolean> {
    const callback = this.consumeSsoCallback();
    if (callback.error === "access_denied") {
      this.clear();
      return false;
    }
    if (callback.error) {
      this.clear();
      throw new Error("Majom ID не зміг завершити вхід.");
    }

    try {
      if (callback.code) await this.exchangeSsoCode(callback.code);
      else if (this.refreshToken) await this.refreshAccessToken();
      else return false;

      await this.loadIdentity();
      return true;
    } catch (error) {
      this.clear();
      if (error instanceof ApiError && error.status === 401) return false;
      throw error;
    }
  }

  public async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    let response = await this.performRequest(path, init);
    if (response.status === 401 && this.refreshToken) {
      try {
        await this.refreshAccessToken();
        response = await this.performRequest(path, init);
      } catch (error) {
        this.clear();
        throw error;
      }
    }
    if (response.status === 401) this.clear();
    return this.parseResponse<T>(response);
  }

  public async logout(): Promise<void> {
    const refreshToken = this.refreshToken;
    this.clear();
    if (!refreshToken) return;
    try {
      await fetch(`${this.apiUrl}/auth/token/blacklist/`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ refresh: refreshToken }),
      });
    } catch {
      // Local logout still succeeds when the network is unavailable.
    }
  }

  private performRequest(path: string, init: RequestInit): Promise<Response> {
    const headers = new Headers(init.headers);
    if (!headers.has("Accept")) headers.set("Accept", "application/json");
    if (
      init.body &&
      !(init.body instanceof FormData) &&
      !headers.has("Content-Type")
    ) {
      headers.set("Content-Type", "application/json");
    }
    if (this.accessToken)
      headers.set("Authorization", `Bearer ${this.accessToken}`);
    return fetch(`${this.apiUrl}${path}`, {
      ...init,
      headers,
    });
  }

  private consumeSsoCallback(): { code: string | null; error: string | null } {
    const parameters = new URLSearchParams(
      window.location.hash.replace(/^#/, ""),
    );
    const code = parameters.get("sso_code");
    const error = parameters.get("sso_error");
    if (code || error) {
      window.history.replaceState(
        null,
        document.title,
        `${window.location.pathname}${window.location.search}`,
      );
    }
    return { code, error };
  }

  private async exchangeSsoCode(code: string): Promise<void> {
    const response = await fetch(`${this.apiUrl}/auth/sso/exchange/`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ code }),
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      throw new ApiError(
        response.status,
        payload,
        getApiErrorMessage(payload, "Не вдалося завершити вхід."),
      );
    }
    if (!isTokenSessionResponse(payload)) {
      throw new Error("Сервер повернув некоректну token-сесію.");
    }
    this.user = payload.user;
    this.accessToken = payload.access;
    this.refreshToken = payload.refresh;
    storeRefreshToken(payload.refresh);
  }

  private async refreshAccessToken(): Promise<void> {
    if (!this.refreshToken) throw new Error("Потрібна авторизація.");
    const response = await fetch(`${this.apiUrl}/auth/token/refresh/`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ refresh: this.refreshToken }),
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      throw new ApiError(
        response.status,
        payload,
        getApiErrorMessage(payload, "Не вдалося оновити сесію входу."),
      );
    }
    if (!isTokenRefreshResponse(payload)) {
      throw new Error("Сервер повернув некоректний access token.");
    }
    this.accessToken = payload.access;
    if (payload.refresh) {
      this.refreshToken = payload.refresh;
      storeRefreshToken(payload.refresh);
    }
  }

  private async loadIdentity(): Promise<void> {
    if (!this.accessToken) throw new Error("Потрібна авторизація.");
    const response = await fetch(`${this.apiUrl}/auth/sso/me/`, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${this.accessToken}`,
      },
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      throw new ApiError(
        response.status,
        payload,
        getApiErrorMessage(payload, "Не вдалося перевірити сесію входу."),
      );
    }
    if (!isIdentityResponse(payload)) {
      throw new Error("Сервер повернув некоректного користувача.");
    }
    this.user = payload.user;
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
    this.accessToken = null;
    this.refreshToken = null;
    storeRefreshToken(null);
  }
}
