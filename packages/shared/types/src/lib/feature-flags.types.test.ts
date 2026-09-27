import { describe, expect, it } from 'vitest';

import {
  FEATURE_FLAG_CATALOG,
  FEATURE_FLAG_KEYS,
  FLAG_DOMAIN,
  FLAG_GROUP,
  flagMetaFor,
} from './feature-flags.types';

describe('feature flag catalog', () => {
  it('has an entry for every known flag key and nothing else', () => {
    const knownKeys = Object.values(FEATURE_FLAG_KEYS).sort();
    expect(Object.keys(FEATURE_FLAG_CATALOG).sort()).toEqual(knownKeys);
  });

  it('only uses declared groups and reserves the fallback group for unknowns', () => {
    for (const meta of Object.values(FEATURE_FLAG_CATALOG)) {
      expect(Object.values(FLAG_GROUP)).toContain(meta.group);
      expect(meta.group).not.toBe(FLAG_GROUP.OTHER);
    }
  });

  it('labels the email verification gate so the backoffice can find it', () => {
    expect(flagMetaFor(FEATURE_FLAG_KEYS.EMAIL_VERIFICATION_GATE)).toEqual({
      domain: FLAG_DOMAIN.PRODUCT,
      group: FLAG_GROUP.ACCESS,
      label: 'Verified email required',
    });
  });

  it('falls back to the product fallback group for unknown keys', () => {
    expect(flagMetaFor('some_adhoc_flag')).toEqual({
      domain: FLAG_DOMAIN.PRODUCT,
      group: FLAG_GROUP.OTHER,
      label: 'some_adhoc_flag',
    });
  });

  it('does not mistake inherited object properties for catalogued flags', () => {
    expect(flagMetaFor('constructor')).toEqual({
      domain: FLAG_DOMAIN.PRODUCT,
      group: FLAG_GROUP.OTHER,
      label: 'constructor',
    });
  });
});
