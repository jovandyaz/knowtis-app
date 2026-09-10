#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import {
  existsSync,
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
const DESIGN_SYSTEM = join(ROOT, 'packages/design-system/src');
const TARGET = join(DESIGN_SYSTEM, 'components/ui');
const STYLES = join(DESIGN_SYSTEM, 'styles.css');

const SEMANTIC_TOKENS = [
  ...readFileSync(STYLES, 'utf8').matchAll(/^\s*--color-([a-z0-9-]+):/gm),
]
  .map(([, name]) => name)
  .sort((a, b) => b.length - a.length);

const TOKEN_UTILITIES =
  'bg|text|border|ring|fill|stroke|from|to|via|outline|shadow|accent|caret|divide|decoration|placeholder';

const VARIANT = String.raw`(?:[a-z*][\w*-]*(?:-\[[^\]]*\])?(?:\/[\w-]+)?|\[[^\]]*\]):`;

const DEAD_MOTION = new RegExp(
  `(?:${VARIANT})*(?:animate-(?:in|out)|(?:fade|zoom)-(?:in|out)(?:-\\d+)?|slide-(?:in-from|out-to)-[a-z]+(?:-\\d+)?)(?![\\w-])\\s*`,
  'g'
);

const MOTION_GUARD = 'motion-reduce:transition-none';

const TOKEN_CLASS = new RegExp(
  `\\b(${TOKEN_UTILITIES})-(${SEMANTIC_TOKENS.join('|')})\\b`,
  'g'
);

const CLASS_STRING = /"([^"\n]*)"|'([^'\n]*)'/g;

function isClassList(tokens) {
  return tokens.some((token) => /^[a-z*[]/.test(token) && /[-:]/.test(token));
}

function needsMotionGuard(token) {
  const utility = token.split(':').pop();
  return /^transition(?:-|$)/.test(utility) && utility !== 'transition-none';
}

function mapClassLists(source, transform) {
  return source.replace(CLASS_STRING, (whole, dq, sq) => {
    const literal = dq ?? sq ?? '';
    const tokens = literal.split(/\s+/).filter(Boolean);
    if (!isClassList(tokens)) {
      return whole;
    }
    const quote = dq === undefined ? "'" : '"';
    return `${quote}${transform(literal, tokens)}${quote}`;
  });
}

export function normalize(source) {
  let out = source
    .replace(/from ["']cn["']/g, "from '../../utils/cn'")
    .replace(/^"use client"\n+/, '');

  if (/\bReact\./.test(out) && !/^import (?:type )?\* as React/m.test(out)) {
    const typeOnly = !/<[A-Z]|React\.(?:use|create|forward|memo|Fragment)/.test(
      out
    );
    out = `import ${typeOnly ? 'type ' : ''}* as React from 'react'\n${out}`;
  }

  out = mapClassLists(out, (literal, tokens) =>
    tokens.some(needsMotionGuard) && !tokens.includes(MOTION_GUARD)
      ? `${literal} ${MOTION_GUARD}`
      : literal
  );

  const withoutDeadMotion = out.replace(DEAD_MOTION, '');
  const strippedMotion = withoutDeadMotion !== out;
  const hardcodedMotion =
    /\b(?:duration-\d+|ease-(?:in|out|linear|in-out))\b/.test(
      withoutDeadMotion
    );

  return {
    content: withoutDeadMotion.replace(
      TOKEN_CLASS,
      (_match, utility, token) => `${utility}-(--${token})`
    ),
    strippedMotion,
    hardcodedMotion,
  };
}

const DEAD_MOTION_UTILITY =
  /(?:^|:)(?:animate-(?:in|out)|(?:fade|zoom)-(?:in|out)|slide-(?:in-from|out-to)-)/;

export function assertClean(file, content) {
  const problems = [];

  if (/from ['"]@\//.test(content)) {
    problems.push('unresolvable "@/" import survived normalization');
  }

  mapClassLists(content, (literal, tokens) => {
    for (const token of tokens) {
      if (/[:/]$/.test(token)) {
        problems.push(`class "${token}" ends in a dangling ":" or "/"`);
      }
      if (DEAD_MOTION_UTILITY.test(token)) {
        problems.push(
          `"${token}" needs tw-animate-css, which is not installed`
        );
      }
      if (needsMotionGuard(token) && !tokens.includes(MOTION_GUARD)) {
        problems.push(`"${token}" is missing "${MOTION_GUARD}"`);
      }
    }
    return literal;
  });

  if (problems.length > 0) {
    throw new Error(`${file}:\n  - ${[...new Set(problems)].join('\n  - ')}`);
  }
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

function stagedDependencies(stage) {
  const manifest = JSON.parse(
    readFileSync(join(stage, 'package.json'), 'utf8')
  );
  const root = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const installed = { ...root.dependencies, ...root.devDependencies };
  return Object.keys(manifest.dependencies ?? {}).filter(
    (name) => !(name in installed)
  );
}

function run() {
  const components = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  const overwrite = process.argv.includes('--overwrite');

  if (components.length === 0) {
    console.error('usage: pnpm ds:add <component>... [--overwrite]');
    process.exit(1);
  }

  const stage = createStage();
  const written = [];
  const needsMotion = [];
  const needsTokens = [];
  let missingDeps = [];

  try {
    execFileSync(
      'pnpm',
      ['dlx', 'shadcn@4', 'add', ...components, '--yes', '--cwd', '.'],
      { cwd: stage, stdio: 'inherit' }
    );

    missingDeps = stagedDependencies(stage);

    const produced = readdirSync(join(stage, 'src'), {
      recursive: true,
      withFileTypes: true,
    }).filter((entry) => entry.isFile() && entry.name.endsWith('.tsx'));

    mkdirSync(TARGET, { recursive: true });

    for (const entry of produced) {
      const dest = join(TARGET, entry.name);
      const pascal = entry.name
        .replace(/(^|-)([a-z])/g, (_m, _sep, c) => c.toUpperCase())
        .replace('.tsx', '');

      if (existsSync(join(DESIGN_SYSTEM, 'components', `${pascal}.tsx`))) {
        console.warn(
          `warn ${entry.name}: the design system already owns ${pascal}.tsx — reconcile them before exporting both`
        );
      }
      if (existsSync(dest) && !overwrite) {
        console.warn(
          `skip ${entry.name} (exists; pass --overwrite to replace)`
        );
        continue;
      }
      if (existsSync(dest)) {
        console.warn(`overwrite ${entry.name}`);
      }

      const { content, strippedMotion, hardcodedMotion } = normalize(
        readFileSync(join(entry.parentPath, entry.name), 'utf8')
      );
      assertClean(entry.name, content);

      writeFileSync(dest, content);
      written.push(dest);
      if (strippedMotion) {
        needsMotion.push(entry.name);
      }
      if (hardcodedMotion) {
        needsTokens.push(entry.name);
      }
    }
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }

  if (written.length > 0) {
    execFileSync('pnpm', ['exec', 'prettier', '--write', ...written], {
      cwd: ROOT,
      stdio: 'inherit',
    });
  }

  console.log(`\n${written.length} file(s) -> src/components/ui/`);
  if (missingDeps.length > 0) {
    console.log(`Install: pnpm add ${missingDeps.join(' ')} -w`);
  }
  if (needsMotion.length > 0) {
    console.log(
      `Dropped tw-animate-css from ${needsMotion.join(', ')} — add a DS animation (e.g. 'animate-overlay-pop motion-reduce:animate-none')`
    );
  }
  if (needsTokens.length > 0) {
    console.log(
      `Hardcoded duration/easing in ${needsTokens.join(', ')} — swap for duration-(--motion-duration-fast) / ease-standard`
    );
  }
  console.log('Add the exports to packages/design-system/src/index.ts');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run();
}
