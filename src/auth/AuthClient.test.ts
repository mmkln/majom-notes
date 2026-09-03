// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthClient } from './AuthClient.ts';

function sessionResponse(): Response {
  return new Response(
    JSON.stringify({
      authenticated: true,
      user: {
        id: 'user-1',
        email: 'user@example.test',
        username: 'user',
      },
      csrfToken: 'csrf-token',
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

describe('AuthClient', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('builds a session login URL for the Notes destination', () => {
    const auth = new AuthClient(
      'https://api.example.test',
      'https://notes.example.test/',
    );

    const loginUrl = new URL(auth.buildLoginUrl(true));

    expect(loginUrl.pathname).toBe('/auth/sso/login/');
    expect(loginUrl.searchParams.get('flow')).toBeNull();
    expect(loginUrl.searchParams.get('return_to')).toBe(
      'https://notes.example.test/',
    );
    expect(loginUrl.searchParams.get('switch')).toBe('1');
  });

  it('restores the Django session with cookies', async () => {
    window.localStorage.setItem('majom-notes:refresh-token:v1', 'legacy-token');
    const fetchMock = vi.fn().mockResolvedValue(sessionResponse());
    vi.stubGlobal('fetch', fetchMock);
    const auth = new AuthClient(
      'https://api.example.test',
      'https://notes.example.test/',
    );

    await expect(auth.restore()).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/auth/sso/session/',
      expect.objectContaining({ credentials: 'include' }),
    );
    expect(auth.currentUser?.email).toBe('user@example.test');
    expect(auth.isAuthenticated).toBe(true);
    expect(
      window.localStorage.getItem('majom-notes:refresh-token:v1'),
    ).toBeNull();
  });

  it('treats an unauthorized session response as signed out', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('{}', { status: 401 })),
    );
    const auth = new AuthClient(
      'https://api.example.test',
      'https://notes.example.test/',
    );

    await expect(auth.restore()).resolves.toBe(false);

    expect(auth.currentUser).toBeNull();
    expect(auth.isAuthenticated).toBe(false);
  });

  it('sends the session cookie and CSRF token with mutations', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(sessionResponse())
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const auth = new AuthClient(
      'https://api.example.test',
      'https://notes.example.test/',
    );
    await auth.restore();

    await expect(
      auth.request<{ ok: boolean }>('/notes/', {
        method: 'POST',
        body: JSON.stringify({ title: 'Note' }),
      }),
    ).resolves.toEqual({ ok: true });

    const request = fetchMock.mock.calls[1];
    const headers = new Headers(request[1]?.headers);
    expect(request[1]?.credentials).toBe('include');
    expect(headers.get('X-CSRFToken')).toBe('csrf-token');
    expect(headers.get('Content-Type')).toBe('application/json');
  });

  it('logs out through the session endpoint', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(sessionResponse())
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const auth = new AuthClient(
      'https://api.example.test',
      'https://notes.example.test/',
    );
    await auth.restore();

    await auth.logout();

    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://api.example.test/auth/sso/logout/',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
      }),
    );
    const headers = new Headers(fetchMock.mock.calls[1][1]?.headers);
    expect(headers.get('X-CSRFToken')).toBe('csrf-token');
    expect(auth.isAuthenticated).toBe(false);
  });
});
