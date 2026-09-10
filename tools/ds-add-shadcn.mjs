#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = join(ROOT, 'packages/design-system/src/components/ui');
const STYLES = join(ROOT, 'packages/design-system/src/styles.css');

const SEMANTIC_TOKENS = [
  ...readFileSync(STYLES, 'utf8').matchAll(/^\s*--color-([a-z0-9-]+):/gm),
]
  .map(([, name]) => name)
  .sort((a, b) => b.length - a.length);

const TOKEN_UTILITIES =
  'bg|text|border|ring|fill|stroke|from|to|via|outline|shadow|accent|caret|divide|decoration|placeholder';

const DEAD_MOTION =
  /(?:[a-z-]+(?:-\[[^\]]*\])?:)*(?:animate-(?:in|out)|fade-(?:in|out)-\d+|zoom-(?:in|out)-\d+|slide-in-from-[a-z]+-\d+)\s*/g;

const components = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const overwrite = process.argv.includes('--overwrite');

if (components.length === 0) {
  console.error('usage: pnpm ds:add <component>... [--overwrite]');
  process.exit(1);
}

function createStage() {
  const stage = mkdtempSync(join(tmpdir(), 'shadcn-stage-'));
  mkdirSync(join(stage, 'src/components/ui'), { recursive: true });
  writeFileSync(
    join(stage, 'package.json'),
    '{"name":"stage","private":true,"type":"module"}'
  );
  writeFileSync(
    join(stage, 'tsconfig.json'),
    '{"compilerOptions":{"baseUrl":".","paths":{"@/*":["./src/*"]}}}'
  );
  writeFileSync(join(stage, 'src/styles.css'), "@import 'tailwindcss';\n");
  writeFileSync(
    join(stage, 'components.json'),
    JSON.stringify({
      $schema: 'https://ui.shadcn.com/schema.json',
      style: 'new-york',
      rsc: false,
      tsx: true,
      tailwind: {
        config: '',
        css: 'src/styles.css',
        baseColor: 'neutral',
        cssVariables: true,
        prefix: '',
      },
      aliases: {
        components: '@/components',
        ui: '@/components/ui',
        utils: '@/utils/cn',
        lib: '@/utils',
        hooks: '@/hooks',
      },
      iconLibrary: 'lucide',
    })
  );
  return stage;
}

function normalize(source) {
  let out = source
    .replace(/from ["']cn["']/g, "from '../../utils/cn'")
    .replace(/^"use client"\n+/, '');

  if (/\bReact\./.test(out) && !/^import \* as React/m.test(out)) {
    out = `import * as React from 'react'\n${out}`;
  }

  out = out.replace(
    /\btransition-(all|colors|transform|opacity)\b(?![^"'`]*motion-reduce)/g,
    (match) => `${match} motion-reduce:transition-none`
  );

  const withoutDeadMotion = out.replace(DEAD_MOTION, '');
  const strippedMotion = withoutDeadMotion !== out;

  const normalized = withoutDeadMotion.replace(
    new RegExp(
      `\\b(${TOKEN_UTILITIES})-(${SEMANTIC_TOKENS.join('|')})\\b`,
      'g'
    ),
    (_match, utility, token) => `${utility}-(--${token})`
  );

  return { content: normalized, strippedMotion };
}

const stage = createStage();
execFileSync(
  'pnpm',
  ['dlx', 'shadcn@4', 'add', ...components, '--yes', '--cwd', '.'],
  { cwd: stage, stdio: 'inherit' }
);

mkdirSync(TARGET, { recursive: true });
const written = [];
const needsMotion = [];

for (const file of readdirSync(join(stage, 'src/components/ui'))) {
  const dest = join(TARGET, file);
  try {
    readFileSync(dest);
    if (!overwrite) {
      console.warn(`skip ${file} (exists; pass --overwrite to replace)`);
      continue;
    }
  } catch {
    /* new file */
  }
  const { content, strippedMotion } = normalize(
    readFileSync(join(stage, 'src/components/ui', file), 'utf8')
  );
  writeFileSync(dest, content);
  written.push(dest);
  if (strippedMotion) {
    needsMotion.push(file);
  }
}

rmSync(stage, { recursive: true, force: true });

if (written.length > 0) {
  execFileSync('pnpm', ['exec', 'prettier', '--write', ...written], {
    cwd: ROOT,
    stdio: 'inherit',
  });
}

console.log(`\n${written.length} file(s) -> src/components/ui/`);
if (needsMotion.length > 0) {
  console.log(
    `Dropped tw-animate-css classes from: ${needsMotion.join(', ')} — add a DS animation (e.g. 'animate-overlay-pop motion-reduce:animate-none')`
  );
}
console.log('Add the exports to packages/design-system/src/index.ts');
