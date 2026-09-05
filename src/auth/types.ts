export type AuthUser = {
  id: string;
  email: string;
  username: string;
};

export type TokenSessionResponse = {
  user: AuthUser;
  access: string;
  refresh: string;
};

export type IdentityResponse = { user: AuthUser };

export type TokenRefreshResponse = {
  access: string;
  refresh?: string;
};
