export function sanitizeFilename(original: string): string {
  const base = original.split(/[\\/]/).pop() ?? '';
  const dot = base.lastIndexOf('.');
  const rawName = dot > 0 ? base.slice(0, dot) : base;
  const rawExt = dot > 0 ? base.slice(dot + 1) : '';
  const clean = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  const name = clean(rawName) || 'image';
  const ext = clean(rawExt);
  return ext ? `${name}.${ext}` : name;
}
