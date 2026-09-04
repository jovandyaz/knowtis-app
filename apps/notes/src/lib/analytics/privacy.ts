import type { CaptureResult, Properties, Property } from 'posthog-js';

const FIRST_PARTY_ORIGIN = 'https://knowtis.app';
const URL_PROPERTY_KEYS = new Set([
  '$current_url',
  '$initial_current_url',
  '$initial_referrer',
  '$pathname',
  '$prev_pageview_pathname',
  '$referrer',
  '$session_entry_pathname',
  '$session_entry_referrer',
  '$session_entry_url',
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
const QUERY_DERIVED_PROPERTY_KEYS = new Set([
  '_kx',
  'dclid',
  'epik',
  'fbclid',
  'gad_source',
  'gbraid',
  'gclid',
  'gclsrc',
  'igshid',
  'irclid',
  'li_fat_id',
  'mc_cid',
  'msclkid',
  'ph_keyword',
  'qclid',
  'rdt_cid',
  'sccid',
  'ttclid',
  'twclid',
  'wbraid',
]);
const QUERY_DERIVED_COMPACT_KEYS = new Set(
  [...QUERY_DERIVED_PROPERTY_KEYS].map((key) => key.replace(/[^a-z0-9]/g, ''))
);

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

function normalizePropertyKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/^\$+/, '');
}

function isQueryDerivedProperty(key: string): boolean {
  const normalizedKey = normalizePropertyKey(key);
  const segments = normalizedKey.split(/[^a-z0-9]+/);
  const compactKey = normalizedKey.replace(/[^a-z0-9]/g, '');

  return (
    QUERY_DERIVED_PROPERTY_KEYS.has(normalizedKey) ||
    QUERY_DERIVED_COMPACT_KEYS.has(compactKey) ||
    segments.includes('utm') ||
    segments.includes('campaign') ||
    segments.includes('keyword') ||
    segments.includes('search') ||
    (segments.includes('click') && segments.includes('id'))
  );
}

function isSensitiveEventProperty(key: string): boolean {
  const normalizedKey = normalizePropertyKey(key);
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
    if (propertyKind === 'event' && isQueryDerivedProperty(key)) {
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
  if (event.event === '$snapshot') {
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
