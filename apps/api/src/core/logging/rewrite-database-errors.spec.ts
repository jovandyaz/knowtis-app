import { inspect, type InspectOptions } from 'node:util';

import { describe, expect, it } from 'vitest';

import { failedQuery, postgresError } from '../../test-support/database-errors';
import { rewriteDatabaseErrors } from './rewrite-database-errors';

const INSPECT_DEPTH = 4;
const OPTIONS: InspectOptions = {
  depth: INSPECT_DEPTH,
  breakLength: Infinity,
};
const DEFAULT_BREADTH = 100;
const SQLSTATE_LENGTH = 5;
const SECRET_PARAM = 'sentinel-walker-param';
const DIAGNOSTICS =
  'DrizzleQueryError (failureCategory=unclassified, sqlState=40P01)';

class Registry extends Map<string, unknown> {}
class Tags extends Set<unknown> {}
class Batch extends Array<unknown> {}

class Sealed {
  readonly #contents: unknown;

  constructor(contents: unknown) {
    this.#contents = contents;
  }

  [inspect.custom](): string {
    return `Sealed<${typeof this.#contents}>`;
  }
}

function rendered(value: unknown, options: InspectOptions = OPTIONS): string {
  return inspect(rewriteDatabaseErrors(value, options), options);
}

describe('rewriteDatabaseErrors', () => {
  it('replaces a failed query with its diagnostics and keeps its frames', () => {
    const rewritten = rewriteDatabaseErrors(
      failedQuery([SECRET_PARAM]),
      OPTIONS
    );

    expect(String(rewritten).split('\n')[0]).toBe(DIAGNOSTICS);
    expect(String(rewritten)).toContain('database-errors.ts');
    expect(String(rewritten)).not.toContain(SECRET_PARAM);
  });

  it('keeps a cycle a cycle in the copy', () => {
    const payload: Record<string, unknown> = { failure: failedQuery([]) };
    payload.self = payload;

    const rewritten = rewriteDatabaseErrors(payload, OPTIONS) as Record<
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

    const rewritten = rewriteDatabaseErrors(outer, OPTIONS) as TypeError & {
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

    const rewritten = rewriteDatabaseErrors({ at, nested }, OPTIONS) as {
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

    expect(rewriteDatabaseErrors({ proxy }, OPTIONS)).toEqual({
      proxy: '[unreadable]',
    });
  });

  it('leaves an object that inspects itself to its own inspector', () => {
    const sealed = new Sealed(failedQuery([SECRET_PARAM]));

    const rewritten = rewriteDatabaseErrors({ sealed }, OPTIONS) as {
      sealed: unknown;
    };

    expect(rewritten.sealed).toBe(sealed);
    expect(inspect(rewritten, OPTIONS)).toBe('{ sealed: Sealed<object> }');
  });

  it.each([
    [
      'a settled promise',
      () => Promise.resolve(failedQuery([SECRET_PARAM])),
      '[Promise]',
    ],
    [
      'a Map iterator',
      () => new Map([['failure', failedQuery([SECRET_PARAM])]]).values(),
      '[Map Iterator]',
    ],
    [
      'a Set iterator',
      () => new Set([failedQuery([SECRET_PARAM])]).values(),
      '[Set Iterator]',
    ],
  ])(
    'replaces %s, whose contents only inspect can read, with a placeholder',
    (_kind, make, placeholder) => {
      const output = rendered({ held: make() });

      expect(output).toBe(`{ held: '${placeholder}' }`);
      expect(output).not.toContain(SECRET_PARAM);
    }
  );

  it('keeps the class and the extra properties of Map and Set subclasses, and the class of Array subclasses', () => {
    const registry = Object.assign(
      new Registry([['failure', failedQuery([SECRET_PARAM])]]),
      { label: 'registry', original: failedQuery([SECRET_PARAM]) }
    );
    const tags = Object.assign(new Tags([failedQuery([SECRET_PARAM])]), {
      label: 'tags',
    });
    const batch = Batch.from([failedQuery([SECRET_PARAM])]);

    const output = rendered({ registry, tags, batch });

    expect(output).toContain("Registry(1) [Map] { 'failure' => ");
    expect(output).toContain("label: 'registry'");
    expect(output).toContain('Tags(1) [Set] { ');
    expect(output).toContain("label: 'tags'");
    expect(output).toContain('Batch(1) [ ');
    expect(output).toContain(DIAGNOSTICS);
    expect(output).not.toContain(SECRET_PARAM);
  });

  it('keeps the holes of a sparse array', () => {
    // eslint-disable-next-line no-sparse-arrays
    const sparse = [, failedQuery([SECRET_PARAM]), , 'last'];

    const output = rendered({ sparse });

    expect(output).toMatch(/^\{ sparse: \[ <1 empty item>, '/);
    expect(output).toContain("<1 empty item>, 'last' ] }");
    expect(output).not.toContain(SECRET_PARAM);
  });

  it.each([
    ['an array', (items: unknown[]) => items],
    ['a Map', (items: unknown[]) => new Map(items.map((item, i) => [i, item]))],
    ['a Set', (items: unknown[]) => new Set(items)],
  ])(
    'opens only the entries of %s that inspect prints, and still counts the rest',
    (_kind, collect) => {
      const printed = Array.from({ length: DEFAULT_BREADTH }, (_, index) =>
        failedQuery(
          [SECRET_PARAM],
          postgresError({ code: String(index).padStart(SQLSTATE_LENGTH, '0') })
        )
      );
      const unprinted = Array.from({ length: 7 }, () => ({ untouched: true }));
      const source = collect([...printed, ...unprinted]);

      const output = rendered(source, { breakLength: Infinity });

      expect(output).toContain('... 7 more items');
      expect(output).not.toContain(SECRET_PARAM);
      const copy = rewriteDatabaseErrors(source, OPTIONS);
      if (copy instanceof Map && source instanceof Map) {
        expect(copy.get(DEFAULT_BREADTH)).toBe(source.get(DEFAULT_BREADTH));
      }
      if (copy instanceof Set && source instanceof Set) {
        expect([...copy].at(-1)).toBe([...source].at(-1));
      }
      if (Array.isArray(copy) && Array.isArray(source)) {
        expect(copy).toHaveLength(source.length);
        expect(copy[DEFAULT_BREADTH]).toBe(source[DEFAULT_BREADTH]);
        expect(Object.hasOwn(copy, DEFAULT_BREADTH + 1)).toBe(false);
      }
    }
  );

  it('follows the breadth of the options it is given', () => {
    const items = Array.from({ length: 5 }, () => failedQuery([SECRET_PARAM]));
    const options: InspectOptions = { ...OPTIONS, maxArrayLength: 3 };

    const output = rendered(items, options);

    expect(output).toContain('... 2 more items');
    expect(output).not.toContain(SECRET_PARAM);
  });

  it.each([
    ['numbers past the breadth', Array.from({ length: 250 }, (_, i) => i)],
    [
      'a long Map',
      new Map(Array.from({ length: 150 }, (_, i) => [i, `v${i}`] as const)),
    ],
    ['a long Set', new Set(Array.from({ length: 150 }, (_, i) => i))],
    ['a Map subclass', new Registry([['a', { b: [1, 2, 3] }]])],
    // eslint-disable-next-line no-sparse-arrays
    ['a sparse array', [1, , 3, , , 6]],
    [
      'an error with a cause',
      new Error('outer', { cause: new Error('inner') }),
    ],
    [
      'a class instance',
      new (class Point {
        x = 1;
        y = 2;
      })(),
    ],
    ['a date and a buffer', { at: new Date(0), bytes: Buffer.from('ab') }],
  ])('renders %s exactly as inspect renders the original', (_kind, value) => {
    expect(rendered(value)).toBe(inspect(value, OPTIONS));
  });
});
