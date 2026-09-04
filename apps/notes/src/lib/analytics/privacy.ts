import type { CaptureResult, Properties, Property } from 'posthog-js';

const FIRST_PARTY_ORIGIN = 'https://knowtis.app';
const URL_PROPERTY_KEYS = new Set([
  '$current_url',
  '$initial_current_url',
  '$initial_referrer',
  '$pathname',
  '$referrer',
]);
const PERSON_PROPERTY_KEYS = new Set([
  'email',
  'is_internal',
  'locale',
  'name',
  'role',
]);
const SENSITIVE_PROPERTY_ROOTS = [
  'collaborator',
  'content',
  'cost',
  'key',
  'model',
  'note',
  'output',
  'prompt',
  'query',
  'response',
  'source',
  'text',
  'title',
  'token',
];

function templatePathname(pathname: string): string {
  if (/^\/notes\/[^/]+/.test(pathname)) {
    return pathname.replace(/^\/notes\/[^/]+/, '/notes/:noteId');
  }
  if (/^\/s\/[^/]+/.test(pathname)) {
    return pathname.replace(/^\/s\/[^/]+/, '/s/:shareToken');
  }
  return pathname;
}

function sanitizeUrl(key: string, value: Property): Property | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  try {
    const isRelative = value.startsWith('/');
    if (!isRelative && !/^https?:\/\//.test(value)) {
      return undefined;
    }
    const url = new URL(value, FIRST_PARTY_ORIGIN);
    if (url.origin !== FIRST_PARTY_ORIGIN) {
      return url.origin;
    }

    const pathname = templatePathname(url.pathname);
    if (key === '$pathname' || isRelative) {
      return pathname;
    }
    return `${url.origin}${pathname}`;
  } catch {
    return undefined;
  }
}

function isSensitiveEventProperty(key: string): boolean {
  const normalizedKey = key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/^\$+/, '');
  if (normalizedKey === 'source') {
    return false;
  }

  return normalizedKey
    .split(/[^a-z0-9]+/)
    .some((segment) =>
      SENSITIVE_PROPERTY_ROOTS.some(
        (root) => segment === root || segment === `${root}s`
      )
    );
}

function sanitizeProperties(
  properties: Properties,
  propertyKind: 'event' | 'person'
): Properties {
  const sanitized: Properties = {};

  for (const [key, value] of Object.entries(properties)) {
    if (URL_PROPERTY_KEYS.has(key)) {
      const sanitizedUrl = sanitizeUrl(key, value);
      if (sanitizedUrl !== undefined) {
        sanitized[key] = sanitizedUrl;
      }
      continue;
    }
    if (
      (propertyKind === 'event' && !isSensitiveEventProperty(key)) ||
      (propertyKind === 'person' && PERSON_PROPERTY_KEYS.has(key))
    ) {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

export function sanitizePostHogEvent(
  event: CaptureResult | null
): CaptureResult | null {
  if (event === null) {
    return null;
  }

  return {
    ...event,
    properties: sanitizeProperties(event.properties, 'event'),
    ...(event.$set
      ? { $set: sanitizeProperties(event.$set, 'person') }
      : undefined),
    ...(event.$set_once
      ? { $set_once: sanitizeProperties(event.$set_once, 'person') }
      : undefined),
  };
}
