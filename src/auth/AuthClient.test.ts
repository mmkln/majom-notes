// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthClient } from "./AuthClient.ts";

function tokenSessionResponse(): Response {
  return new Response(
    JSON.stringify({
      user: {
        id: "user-1",
        email: "user@example.test",
        username: "user",
      },
      access: "access-token",
      refresh: "refresh-token",
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

describe("AuthClient", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("builds a token login URL for the Notes destination", () => {
    const auth = new AuthClient(
      "https://api.example.test",
      "https://notes.example.test/",
    );

    const loginUrl = new URL(auth.buildLoginUrl(true));

    expect(loginUrl.pathname).toBe("/auth/sso/login/");
    expect(loginUrl.searchParams.get("flow")).toBe("token");
    expect(loginUrl.searchParams.get("return_to")).toBe(
      "https://notes.example.test/",
    );
    expect(loginUrl.searchParams.get("switch")).toBe("1");
  });

  it("exchanges the callback code and restores identity with Bearer auth", async () => {
    window.history.replaceState(null, "", "/#sso_code=one-time-code");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tokenSessionResponse())
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            user: {
              id: "user-1",
              email: "user@example.test",
              username: "user",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const auth = new AuthClient(
      "https://api.example.test",
      "https://notes.example.test/",
    );

    await expect(auth.restore()).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.test/auth/sso/exchange/",
      expect.objectContaining({ method: "POST" }),
    );
    expect(auth.currentUser?.email).toBe("user@example.test");
    expect(auth.isAuthenticated).toBe(true);
    expect(window.localStorage.getItem("majom-notes:refresh-token:v1")).toBe(
      "refresh-token",
    );
  });

  it("treats a failed refresh as signed out", async () => {
    window.localStorage.setItem(
      "majom-notes:refresh-token:v1",
      "stale-refresh",
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 401 })),
    );
    const auth = new AuthClient(
      "https://api.example.test",
      "https://notes.example.test/",
    );

    await expect(auth.restore()).resolves.toBe(false);

    expect(auth.currentUser).toBeNull();
    expect(auth.isAuthenticated).toBe(false);
  });

  it("sends Bearer auth with mutations", async () => {
    window.history.replaceState(null, "", "/#sso_code=one-time-code");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tokenSessionResponse())
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            user: {
              id: "user-1",
              email: "user@example.test",
              username: "user",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const auth = new AuthClient(
      "https://api.example.test",
      "https://notes.example.test/",
    );
    await auth.restore();

    await expect(
      auth.request<{ ok: boolean }>("/notes/", {
        method: "POST",
        body: JSON.stringify({ title: "Note" }),
      }),
    ).resolves.toEqual({ ok: true });

    const request = fetchMock.mock.calls[2];
    const headers = new Headers(request[1]?.headers);
    expect(headers.get("Authorization")).toBe("Bearer access-token");
    expect(headers.get("Content-Type")).toBe("application/json");
  });

  it("revokes the refresh token on logout", async () => {
    window.history.replaceState(null, "", "/#sso_code=one-time-code");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tokenSessionResponse())
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            user: {
              id: "user-1",
              email: "user@example.test",
              username: "user",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const auth = new AuthClient(
      "https://api.example.test",
      "https://notes.example.test/",
    );
    await auth.restore();

    await auth.logout();

    const request = fetchMock.mock.calls[2];
    expect(request[0]).toBe("https://api.example.test/auth/token/blacklist/");
    expect(JSON.parse(request[1]?.body)).toEqual({ refresh: "refresh-token" });
    expect(auth.isAuthenticated).toBe(false);
  });
});
