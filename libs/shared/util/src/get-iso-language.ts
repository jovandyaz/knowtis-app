export function getISOLanguage(locale?: string): string | undefined {
  if (!locale) {
    return undefined;
  }

  const code = locale.split('-')[0].toLowerCase();
  return code.length === 2 || code.length === 3 ? code : undefined;
}
