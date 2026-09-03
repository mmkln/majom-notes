export type AuthUser = {
  id: string;
  email: string;
  username: string;
};

export type SessionResponse = {
  authenticated: true;
  user: AuthUser;
  csrfToken: string;
};
