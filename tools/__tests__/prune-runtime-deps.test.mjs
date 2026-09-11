import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

import {
  externalPackages,
  isPackage,
  listBundles,
  lockedVersions,
  neutralizeChunkLoader,
  packageName,
  scanBundles,
  untraceableImports,
  WEBPACK_CHUNK_LOADER,
} from '../prune-runtime-deps.mjs';

const dirs = [];
after(() => dirs.forEach((dir) => rmSync(dir, { recursive: true })));

function outputDir(files) {
  const dir = mkdtempSync(join(tmpdir(), 'prune-runtime-deps-'));
  dirs.push(dir);
  for (const [file, contents] of Object.entries(files)) {
    writeFileSync(join(dir, file), contents);
  }
  return dir;
}

const imp = (path, external = true) => ({
  path,
  kind: 'require-call',
  external,
});

test('reduces scoped and unscoped subpaths to their package', () => {
  assert.equal(packageName('react'), 'react');
  assert.equal(packageName('react/jsx-runtime'), 'react');
  assert.equal(packageName('@scope/pkg'), '@scope/pkg');
  assert.equal(packageName('@scope/pkg/sub/path.js'), '@scope/pkg');
});

test('treats only bare, non-builtin specifiers as packages', () => {
  assert.equal(isPackage('hono'), true);
  assert.equal(isPackage('@scope/pkg/sub'), true);
  assert.equal(isPackage('node:fs'), false);
  assert.equal(isPackage('fs'), false);
  assert.equal(isPackage('./1.js'), false);
  assert.equal(isPackage('../shared.js'), false);
  assert.equal(isPackage('/abs/path.js'), false);
});

test('collects every external package across bundles, chunk-only ones included', () => {
  const metafile = {
    inputs: {
      'main.js': {
        imports: [
          imp('@scope/pkg/sub'),
          imp('react/jsx-runtime'),
          imp('node:fs'),
          imp('./1.js', false),
          imp('react'),
        ],
      },
      '1.js': { imports: [imp('chunk-only')] },
    },
  };
  assert.deepEqual(externalPackages(metafile), [
    '@scope/pkg',
    'chunk-only',
    'react',
  ]);
});

test('keeps only the warnings that hide an import from the scan', () => {
  const warnings = [
    { id: 'unsupported-require-call' },
    { id: 'unsupported-dynamic-import' },
    { id: 'indirect-require' },
    { id: 'empty-import-meta' },
  ];
  assert.deepEqual(
    untraceableImports(warnings).map(({ id }) => id),
    [
      'unsupported-require-call',
      'unsupported-dynamic-import',
      'indirect-require',
    ]
  );
});

test("neutralizes webpack's chunk loader and nothing that merely resembles it", () => {
  const lookalike = 'require("./" + loadLocale(chunkId))';
  assert.equal(
    neutralizeChunkLoader(`a = ${WEBPACK_CHUNK_LOADER}; b = ${lookalike};`),
    `a = undefined; b = ${lookalike};`
  );
});

test('resolves locked versions and refuses packages the lockfile lacks', () => {
  const externalNodes = { 'npm:hono': { data: { version: '4.12.34' } } };
  assert.deepEqual(lockedVersions(['hono'], externalNodes), {
    hono: '4.12.34',
  });
  assert.throws(
    () => lockedVersions(['hono', 'ghost'], externalNodes),
    /ghost is required by the bundle but not locked/
  );
});

test('refuses an output directory without bundles', () => {
  const dir = outputDir({ 'package.json': '{}' });
  assert.throws(() => listBundles(dir), /holds no \.js bundles/);
});

test('scans a webpack output through its chunk loader and chunks', async () => {
  const dir = outputDir({
    'main.js': [
      `const load = (chunkId) => ${WEBPACK_CHUNK_LOADER};`,
      'module.exports = require("@scope/pkg/sub");',
      'require("node:fs");',
    ].join('\n'),
    '1.js': 'module.exports = require("chunk-only");',
    'notes.md': '# never loaded',
  });
  assert.deepEqual(await scanBundles(listBundles(dir)), [
    '@scope/pkg',
    'chunk-only',
  ]);
});

test('fails on a require the scan cannot resolve to a package', async () => {
  const dir = outputDir({
    'main.js': 'module.exports = (name) => require(name);',
  });
  await assert.rejects(
    scanBundles(listBundles(dir)),
    /main\.js:1 \(unsupported-require-call\)/
  );
});

test('fails on a dynamic import the scan cannot resolve to a package', async () => {
  const dir = outputDir({
    'index.js': 'export const load = (name) => import(name);',
  });
  await assert.rejects(
    scanBundles(listBundles(dir)),
    /index\.js:1 \(unsupported-dynamic-import\)/
  );
});
