import { inspect, types, type InspectOptions } from 'node:util';

import { isDatabaseError } from '../errors/database-diagnostics';
import { stackOf } from '../errors/stack-of';

const UNREADABLE = '[unreadable]';

type Rewrite = (value: unknown) => unknown;

interface Reach {
  readonly depth: number;
  readonly breadth: number;
}

function limitOf(
  configured: number | null | undefined,
  inspectDefault: number | null | undefined
): number {
  const limit = configured === undefined ? inspectDefault : configured;
  return limit ?? Number.POSITIVE_INFINITY;
}

function reachOf(options: InspectOptions): Reach {
  return {
    depth: limitOf(options.depth, inspect.defaultOptions.depth),
    breadth: limitOf(
      options.maxArrayLength,
      inspect.defaultOptions.maxArrayLength
    ),
  };
}

function isOrdinaryObject(value: object): boolean {
  const tag = Object.prototype.toString.call(value);
  return tag === '[object Object]' || tag === '[object Error]';
}

function inspectsItself(value: object): boolean {
  return (
    typeof (value as { [inspect.custom]?: unknown })[inspect.custom] ===
    'function'
  );
}

// inspect reads these through engine internals no copy can reproduce.
function isReadableOnlyByInspect(value: object): boolean {
  return (
    types.isPromise(value) ||
    types.isMapIterator(value) ||
    types.isSetIterator(value)
  );
}

function withPrototypeOf<T extends object>(source: object, copy: T): T {
  return Object.setPrototypeOf(copy, Object.getPrototypeOf(source)) as T;
}

function emptyCopyOf(value: object): object | undefined {
  if (Array.isArray(value)) {
    return withPrototypeOf(value, []);
  }
  if (value instanceof Map) {
    return withPrototypeOf(value, new Map());
  }
  if (value instanceof Set) {
    return withPrototypeOf(value, new Set());
  }
  return isOrdinaryObject(value)
    ? Object.create(Object.getPrototypeOf(value))
    : undefined;
}

// V8 serves an error's stack through an accessor that reads the receiver's
// internal slot, so a copy must hold the rendered string itself.
function copyOwnProperties(source: object, copy: object, rewrite: Rewrite) {
  for (const key of Reflect.ownKeys(source)) {
    const descriptor = Object.getOwnPropertyDescriptor(source, key);
    if (!descriptor) {
      continue;
    }
    if ('value' in descriptor) {
      descriptor.value = rewrite(descriptor.value);
    } else if (key === 'stack' && source instanceof Error) {
      Object.defineProperty(copy, key, {
        value: source.stack,
        writable: true,
        enumerable: descriptor.enumerable === true,
        configurable: true,
      });
      continue;
    }
    Object.defineProperty(copy, key, descriptor);
  }
}

// Only the first `breadth` entries are printed; the length alone yields the
// "... n more items" count. Node's groupArrayElements also checks `typeof
// value[i]` for every output line, the count line included, so it reads index
// `breadth` to pad a column of numbers: a dense head carries that entry over,
// unprinted. After a hole formatSpecialArray could print it, so it stays out.
function fillArray(
  source: unknown[],
  copy: unknown[],
  rewrite: Rewrite,
  breadth: number
): void {
  const printed = Math.min(source.length, breadth);
  let dense = true;
  for (let index = 0; index < printed; index += 1) {
    if (Object.hasOwn(source, index)) {
      copy[index] = rewrite(source[index]);
    } else {
      dense = false;
    }
  }
  if (dense && printed < source.length && Object.hasOwn(source, printed)) {
    copy[printed] = source[printed];
  }
  copy.length = source.length;
}

// A Map or a Set only reports its size through its entries, so the ones past
// `breadth` are carried over unopened to keep inspect's count right.
function fillEntries(
  source: Map<unknown, unknown> | Set<unknown>,
  copy: Map<unknown, unknown> | Set<unknown>,
  rewrite: Rewrite,
  breadth: number
): void {
  let position = 0;
  const open = (value: unknown) =>
    position < breadth ? rewrite(value) : value;
  if (source instanceof Map && copy instanceof Map) {
    for (const [key, value] of source) {
      copy.set(open(key), open(value));
      position += 1;
    }
  } else if (source instanceof Set && copy instanceof Set) {
    for (const member of source) {
      copy.add(open(member));
      position += 1;
    }
  }
}

function fill(
  source: object,
  copy: object,
  rewrite: Rewrite,
  breadth: number
): void {
  if (Array.isArray(source) && Array.isArray(copy)) {
    fillArray(source, copy, rewrite, breadth);
    return;
  }
  if (
    (source instanceof Map && copy instanceof Map) ||
    (source instanceof Set && copy instanceof Set)
  ) {
    fillEntries(source, copy, rewrite, breadth);
  }
  copyOwnProperties(source, copy, rewrite);
}

function rewrite(
  value: unknown,
  reach: Reach,
  level: number,
  ancestors: Map<object, unknown>
): unknown {
  if (isDatabaseError(value)) {
    return stackOf(value);
  }
  if (typeof value !== 'object' || value === null || level >= reach.depth) {
    return value;
  }
  const ancestor = ancestors.get(value);
  if (ancestor !== undefined) {
    return ancestor;
  }
  try {
    if (inspectsItself(value)) {
      return value;
    }
    if (isReadableOnlyByInspect(value)) {
      return `[${Object.prototype.toString.call(value).slice(8, -1)}]`;
    }
    const copy = emptyCopyOf(value);
    if (copy === undefined) {
      return value;
    }
    ancestors.set(value, copy);
    fill(
      value,
      copy,
      (nested) => rewrite(nested, reach, level + 1, ancestors),
      reach.breadth
    );
    return copy;
  } catch {
    return UNREADABLE;
  } finally {
    ancestors.delete(value);
  }
}

/**
 * A copy of `value` fit to hand to `inspect(…, options)` with the same
 * options: every database error it holds — in a plain object, an array, a Map
 * key or value, a Set, or any property of an error, its `cause` and an
 * AggregateError's `errors` included — becomes its {@link stackOf} rendering.
 * It opens only what `inspect` prints: objects down to `depth`, since past it
 * `inspect` only names an object, and a database error always has properties,
 * so it is named there, never printed; and the first `maxArrayLength` entries
 * of an array, a Map or a Set. An object with its own inspector is left to it,
 * and a promise or a Map or Set iterator, whose contents only `inspect` can
 * read, becomes a placeholder. Cycles stay cycles, classes are kept, the
 * caller's objects are never modified, and what cannot be read becomes a
 * placeholder.
 */
export function rewriteDatabaseErrors(
  value: unknown,
  options: InspectOptions
): unknown {
  return rewrite(value, reachOf(options), 0, new Map());
}
