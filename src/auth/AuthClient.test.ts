// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthClient } from './AuthClient.ts';

describe('AuthClient', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState(null, '', '/');
    vi.restoreAllMocks();
  });

  it('builds a token login URL for the allowed app destination', () => {
    const auth = new AuthClient(
      'https://api.example.test',
      'https://notes.example.test/',
    );

    const loginUrl = new URL(auth.buildLoginUrl(true));

    expect(loginUrl.pathname).toBe('/auth/sso/login/');
    expect(loginUrl.searchParams.get('flow')).toBe('token');
    expect(loginUrl.searchParams.get('return_to')).toBe(
      'https://notes.example.test/',
    );
    expect(loginUrl.searchParams.get('switch')).toBe('1');
  });

  it('exchanges the callback code and removes it from the address', async () => {
    window.history.replaceState(null, '', '/#sso_code=one-time-code');
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          user: { id: 'user-1', email: 'user@example.test' },
          access: 'access-1',
          refresh: 'refresh-1',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const auth = new AuthClient(
      'https://api.example.test',
      'https://notes.example.test/',
    );

    await expect(auth.restore()).resolves.toBe(true);

    expect(auth.currentUser?.email).toBe('user@example.test');
    expect(window.location.hash).toBe('');
    expect(window.localStorage.getItem('majom-notes:refresh-token:v1')).toBe(
      'refresh-1',
    );
  });

  it('refreshes once and retries an unauthorized API request', async () => {
    window.localStorage.setItem('majom-notes:refresh-token:v1', 'refresh-1');
    const responses = [
      new Response(JSON.stringify({ detail: 'Expired' }), { status: 401 }),
      new Response(
        JSON.stringify({ access: 'access-2', refresh: 'refresh-2' }),
        { status: 200 },
      ),
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    ];
    const fetchMock = vi.fn().mockImplementation(() => {
      const response = responses.shift();
      if (!response) throw new Error('Unexpected fetch call.');
      return Promise.resolve(response);
    });
    vi.stubGlobal('fetch', fetchMock);
    const auth = new AuthClient(
      'https://api.example.test',
      'https://notes.example.test/',
    );

    await expect(auth.request<{ ok: boolean }>('/notes/')).resolves.toEqual({
      ok: true,
    });

    const retryHeaders = new Headers(fetchMock.mock.calls[2][1]?.headers);
    expect(retryHeaders.get('Authorization')).toBe('Bearer access-2');
    expect(window.localStorage.getItem('majom-notes:refresh-token:v1')).toBe(
      'refresh-2',
    );
  });
});
