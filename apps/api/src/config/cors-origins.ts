const LOCAL_DEV_ORIGINS = [
  'http://localhost:4200',
  'http://localhost:4040',
] as const;

export function buildAllowedOrigins(
  nodeEnv: string,
  frontendUrl: string
): string[] {
  if (nodeEnv === 'production') {
    return [frontendUrl];
  }
  return [
    frontendUrl,
    ...LOCAL_DEV_ORIGINS.filter((origin) => origin !== frontendUrl),
  ];
}
