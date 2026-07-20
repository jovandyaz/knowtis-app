const LOCAL_DEV_ORIGINS = [
  'http://localhost:4200',
  'http://localhost:4400',
] as const;

export function buildAllowedOrigins(
  nodeEnv: string,
  frontendUrl: string,
  backofficeUrl?: string
): string[] {
  const appOrigins = backofficeUrl
    ? [frontendUrl, backofficeUrl]
    : [frontendUrl];
  if (nodeEnv === 'production') {
    return appOrigins;
  }
  return [
    ...appOrigins,
    ...LOCAL_DEV_ORIGINS.filter((origin) => !appOrigins.includes(origin)),
  ];
}
