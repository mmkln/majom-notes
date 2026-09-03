export type AuthUser = {
  id: string;
  email: string;
};

export type TokenSessionResponse = {
  user: AuthUser;
  access: string;
  refresh: string;
};

export type RefreshResponse = {
  access: string;
  refresh?: string;
};
