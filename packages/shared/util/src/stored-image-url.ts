const STORED_IMAGE_HOST_SUFFIX = '.public.blob.vercel-storage.com';

export function isStoredImageUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return (
    parsed.protocol === 'https:' &&
    parsed.hostname.endsWith(STORED_IMAGE_HOST_SUFFIX) &&
    parsed.hostname.length > STORED_IMAGE_HOST_SUFFIX.length
  );
}
