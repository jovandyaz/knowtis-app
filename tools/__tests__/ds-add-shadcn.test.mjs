import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { assertClean, normalize } from '../ds-add-shadcn.mjs';

const wrap = (classes) => `const x = cn("${classes}")\n`;
const classesOf = (content) => content.match(/cn\("([^"]*)"\)/)[1];

test('strips the full variant chain, not just its tail', () => {
  const cases = [
    'group-data-[viewport=false]/navigation-menu:data-[state=open]:animate-in',
    'peer-data-[state=open]/nav:animate-out',
    '**:data-[slot=x]:animate-in',
    '*:animate-in',
    '[&_svg]:animate-in',
    'data-[state=closed]:zoom-out-95',
  ];
  for (const input of cases) {
    assert.equal(classesOf(normalize(wrap(input)).content), '', input);
  }
});

test('strips the tw-animate-css utilities that carry no numeric suffix', () => {
  const sheet =
    'data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right data-[motion^=from-]:fade-in data-[state=hidden]:fade-out';
  assert.equal(classesOf(normalize(wrap(sheet)).content), '');
});

test('keeps real utilities that merely start like a motion one', () => {
  const kept = 'animate-pulse animate-overlay-pop slide-y-2 fade';
  assert.equal(classesOf(normalize(wrap(kept)).content), kept);
});

test('pairs every transition form with a reduced-motion opt-out', () => {
  assert.equal(
    classesOf(
      normalize(wrap('transition-[color,box-shadow] rounded-md')).content
    ),
    'transition-[color,box-shadow] rounded-md motion-reduce:transition-none'
  );
  assert.equal(
    classesOf(normalize(wrap('transition rounded-md')).content),
    'transition rounded-md motion-reduce:transition-none'
  );
});

test('guards a transition that sits behind a variant prefix', () => {
  for (const input of [
    'data-[state=open]:transition-opacity',
    'dark:transition-colors',
    'group-hover/item:transition-all',
  ]) {
    assert.equal(
      classesOf(normalize(wrap(input)).content),
      `${input} motion-reduce:transition-none`,
      input
    );
  }
});

test('an unrelated motion-reduce utility does not count as the guard', () => {
  const input = 'transition-colors motion-reduce:opacity-50';
  assert.equal(
    classesOf(normalize(wrap(input)).content),
    `${input} motion-reduce:transition-none`
  );
  assert.throws(() => assertClean('x.tsx', wrap(input)), /is missing/);
});

test('leaves an already-guarded transition alone and never doubles up', () => {
  const guarded = 'transition-colors motion-reduce:transition-none';
  assert.equal(classesOf(normalize(wrap(guarded)).content), guarded);
  assert.equal(
    classesOf(normalize(wrap('transition-none')).content),
    'transition-none'
  );
});

test('rewrites semantic tokens longest-first', () => {
  const { content } = normalize(
    wrap(
      "bg-primary text-primary-foreground ring-ring/50 bg-accent/50 [&_svg:not([class*='text-'])]:text-muted-foreground"
    )
  );
  const classes = classesOf(content);
  assert.match(classes, /bg-\(--primary\)/);
  assert.match(classes, /text-\(--primary-foreground\)/);
  assert.match(classes, /ring-\(--ring\)\/50/);
  assert.match(classes, /bg-\(--accent\)\/50/);
  assert.match(classes, /text-\(--muted-foreground\)/);
  assert.doesNotMatch(classes, /text-\(--primary\)-foreground/);
});

test('does not touch a utility that only contains a token name', () => {
  assert.equal(
    classesOf(normalize(wrap('ring-offset-background')).content),
    'ring-offset-background'
  );
});

test('rewrites the cn placeholder to a relative import', () => {
  const { content } = normalize('import { cn } from "cn"\n');
  assert.equal(content, "import { cn } from '../../utils/cn'\n");
});

test('adds the React import shadcn omits, as type-only when unused at runtime', () => {
  const { content } = normalize(
    'function C(p: React.ComponentProps<"div">) { return null }\n'
  );
  assert.match(content, /^import type \* as React from 'react'/);
});

test('reports stripped motion and hardcoded timing to the caller', () => {
  const result = normalize(wrap('data-[state=open]:animate-in duration-200'));
  assert.equal(result.strippedMotion, true);
  assert.equal(result.hardcodedMotion, true);
  assert.equal(normalize(wrap('rounded-md')).strippedMotion, false);
});

test('assertClean rejects the corruption the regexes are meant to prevent', () => {
  assert.throws(
    () => assertClean('x.tsx', wrap('group-data-[viewport=false]/')),
    /dangling/
  );
  assert.throws(
    () =>
      assertClean('x.tsx', 'import { useIsMobile } from "@/hooks/use-mobile"'),
    /@\//
  );
  assert.throws(
    () => assertClean('x.tsx', wrap('data-[state=open]:animate-in')),
    /tw-animate-css/
  );
});

test('assertClean passes the primitives already vendored in the design system', () => {
  for (const file of ['collapsible', 'hover-card']) {
    const source = readVendored(file);
    assert.doesNotThrow(() => assertClean(file, source), file);
  }
});

function readVendored(name) {
  return readFileSync(
    new URL(
      `../../packages/design-system/src/components/ui/${name}.tsx`,
      import.meta.url
    ),
    'utf8'
  );
}
