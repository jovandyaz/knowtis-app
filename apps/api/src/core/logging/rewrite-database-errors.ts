import { isDatabaseError } from '../errors/database-diagnostics';
import { stackOf } from '../errors/stack-of';

const UNREADABLE = '[unreadable]';

type Rewrite = (value: unknown) => unknown;

function isOrdinaryObject(value: object): boolean {
  const tag = Object.prototype.toString.call(value);
  return tag === '[object Object]' || tag === '[object Error]';
}

function emptyCopyOf(value: object): object | undefined {
  if (Array.isArray(value)) {
    return [];
  }
  if (value instanceof Map) {
    return new Map();
  }
  if (value instanceof Set) {
    return new Set();
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

function fill(source: object, copy: object, rewrite: Rewrite): void {
  if (Array.isArray(source) && Array.isArray(copy)) {
    for (const item of source) {
      copy.push(rewrite(item));
    }
  } else if (source instanceof Map && copy instanceof Map) {
    for (const [key, value] of source) {
      copy.set(rewrite(key), rewrite(value));
    }
  } else if (source instanceof Set && copy instanceof Set) {
    for (const member of source) {
      copy.add(rewrite(member));
    }
  } else {
    copyOwnProperties(source, copy, rewrite);
  }
}

function rewrite(
  value: unknown,
  depth: number,
  level: number,
  ancestors: Map<object, unknown>
): unknown {
  if (isDatabaseError(value)) {
    return stackOf(value);
  }
  if (typeof value !== 'object' || value === null || level >= depth) {
    return value;
  }
  const ancestor = ancestors.get(value);
  if (ancestor !== undefined) {
    return ancestor;
  }
  try {
    const copy = emptyCopyOf(value);
    if (copy === undefined) {
      return value;
    }
    ancestors.set(value, copy);
    fill(value, copy, (nested) => rewrite(nested, depth, level + 1, ancestors));
    return copy;
  } catch {
    return UNREADABLE;
  } finally {
    ancestors.delete(value);
  }
}

/**
 * A copy of `value` fit to hand to `inspect(…, { depth })`: every database
 * error it holds — in a plain object, an array, a Map key or value, a Set, or
 * any property of an error, its `cause` and an AggregateError's `errors`
 * included — becomes its {@link stackOf} rendering. An object at `depth` is
 * kept as is: `inspect` shows what it holds only as `[Name]`, and a database
 * error always has properties, so it is named there, never printed. Cycles
 * stay cycles, the caller's objects are never modified, and what cannot be
 * read becomes a placeholder.
 */
export function rewriteDatabaseErrors(value: unknown, depth: number): unknown {
  return rewrite(value, depth, 0, new Map());
}
