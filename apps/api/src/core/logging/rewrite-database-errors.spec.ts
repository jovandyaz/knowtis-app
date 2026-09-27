import { describe, expect, it } from 'vitest';

import { failedQuery } from '../../test-support/database-errors';
import { rewriteDatabaseErrors } from './rewrite-database-errors';

const INSPECT_DEPTH = 4;
const SECRET_PARAM = 'sentinel-walker-param';
const DIAGNOSTICS =
  'DrizzleQueryError (failureCategory=unclassified, sqlState=40P01)';

describe('rewriteDatabaseErrors', () => {
  it('replaces a failed query with its diagnostics and keeps its frames', () => {
    const rewritten = rewriteDatabaseErrors(
      failedQuery([SECRET_PARAM]),
      INSPECT_DEPTH
    );

    expect(String(rewritten).split('\n')[0]).toBe(DIAGNOSTICS);
    expect(String(rewritten)).toContain('database-errors.ts');
    expect(String(rewritten)).not.toContain(SECRET_PARAM);
  });

  it('keeps a cycle a cycle in the copy', () => {
    const payload: Record<string, unknown> = { failure: failedQuery([]) };
    payload.self = payload;

    const rewritten = rewriteDatabaseErrors(payload, INSPECT_DEPTH) as Record<
      string,
      unknown
    >;

    expect(rewritten).not.toBe(payload);
    expect(rewritten.self).toBe(rewritten);
  });

  it('copies an error with its class, message and stack', () => {
    const outer = Object.assign(new TypeError('outer'), {
      original: failedQuery([SECRET_PARAM]),
    });

    const rewritten = rewriteDatabaseErrors(
      outer,
      INSPECT_DEPTH
    ) as TypeError & {
      original: unknown;
    };

    expect(rewritten).toBeInstanceOf(TypeError);
    expect(rewritten.message).toBe('outer');
    expect(rewritten.stack).toBe(outer.stack);
    expect(String(rewritten.original).split('\n')[0]).toBe(DIAGNOSTICS);
  });

  it('keeps values it does not open, and everything from the inspect depth on, as they are', () => {
    const at = new Date(0);
    const deepest = { failure: failedQuery([SECRET_PARAM]) };
    let nested: unknown = deepest;
    for (let level = 0; level < INSPECT_DEPTH; level += 1) {
      nested = { nested };
    }

    const rewritten = rewriteDatabaseErrors({ at, nested }, INSPECT_DEPTH) as {
      at: unknown;
      nested: unknown;
    };

    expect(rewritten.at).toBe(at);
    let reached = rewritten.nested;
    for (let level = 0; level < INSPECT_DEPTH; level += 1) {
      reached = (reached as { nested: unknown }).nested;
    }
    expect(reached).toBe(deepest);
  });

  it('turns what it cannot read into a placeholder instead of throwing', () => {
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();

    expect(rewriteDatabaseErrors({ proxy }, INSPECT_DEPTH)).toEqual({
      proxy: '[unreadable]',
    });
  });
});
