function requiredEnvironmentValue(name: 'VITE_API_URL' | 'VITE_APP_URL'): string {
  const value = import.meta.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not configured.`);
  }
  return value;
}

export const appConfig = {
  apiUrl: requiredEnvironmentValue('VITE_API_URL').replace(/\/$/, ''),
  appUrl: requiredEnvironmentValue('VITE_APP_URL'),
} as const;
