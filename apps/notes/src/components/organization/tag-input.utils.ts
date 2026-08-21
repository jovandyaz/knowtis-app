import {
  TAG_MAX_DEPTH,
  TAG_PATH_MAX_LENGTH,
  TAG_PATH_SEPARATOR,
  TAG_SEGMENT_MAX_LENGTH,
  TAG_SEGMENT_PATTERN,
} from '@knowtis/shared-types';

/** Mirrors the API's TagPath rules so the picker never offers a path the server will reject. */
export function normalizeTagPath(raw: string): string {
  return raw.trim().toLowerCase().replace(/^#/, '');
}

export function isValidTagPath(raw: string): boolean {
  const path = normalizeTagPath(raw);
  if (!path || path.length > TAG_PATH_MAX_LENGTH) {
    return false;
  }
  const segments = path.split(TAG_PATH_SEPARATOR);
  return (
    segments.length <= TAG_MAX_DEPTH &&
    segments.every(
      (segment) =>
        segment.length > 0 &&
        segment.length <= TAG_SEGMENT_MAX_LENGTH &&
        TAG_SEGMENT_PATTERN.test(segment)
    )
  );
}

export function matchTagPaths(paths: string[], query: string): string[] {
  const needle = normalizeTagPath(query);
  if (!needle) {
    return paths;
  }
  return paths.filter((path) => path.includes(needle));
}
