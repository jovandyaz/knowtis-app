export const STORED_IMAGE_HOST =
  'iy4r311mpkfdcnup.public.blob.vercel-storage.com';

export function isStoredImageUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return (
    parsed.protocol === 'https:' &&
    parsed.hostname === STORED_IMAGE_HOST &&
    parsed.port === '' &&
    parsed.username === '' &&
    parsed.password === ''
  );
}
