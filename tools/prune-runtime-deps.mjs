import { readdirSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { isBuiltin } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createProjectGraphAsync,
  detectPackageManager,
  workspaceRoot,
} from '@nx/devkit';
import { createLockFile, createPackageJson, getLockFileName } from '@nx/js';
import { build } from 'esbuild';

export const WEBPACK_CHUNK_LOADER =
  'require("./" + __webpack_require__.u(chunkId))';

const UNTRACEABLE_IMPORTS = [
  'unsupported-require-call',
  'unsupported-dynamic-import',
  'indirect-require',
];

export const isPackage = (specifier) =>
  !specifier.startsWith('.') &&
  !specifier.startsWith('/') &&
  !isBuiltin(specifier);

export const packageName = (specifier) =>
  specifier
    .split('/')
    .slice(0, specifier.startsWith('@') ? 2 : 1)
    .join('/');

export const neutralizeChunkLoader = (source) =>
  source.replaceAll(WEBPACK_CHUNK_LOADER, 'undefined');

export const untraceableImports = (warnings) =>
  warnings.filter(({ id }) => UNTRACEABLE_IMPORTS.includes(id));

export function externalPackages(metafile) {
  return [
    ...new Set(
      Object.values(metafile.inputs)
        .flatMap(({ imports }) => imports)
        .filter(({ external, path }) => external && isPackage(path))
        .map(({ path }) => packageName(path))
    ),
  ].sort();
}

export function lockedVersions(names, externalNodes) {
  return Object.fromEntries(
    names.map((name) => {
      const node = externalNodes[`npm:${name}`];
      if (!node) {
        throw new Error(`${name} is required by the bundle but not locked`);
      }
      return [name, node.data.version];
    })
  );
}

export function listBundles(outputDir) {
  const bundles = readdirSync(outputDir)
    .filter((file) => file.endsWith('.js'))
    .map((file) => join(outputDir, file));
  if (bundles.length === 0) {
    throw new Error(`${outputDir} holds no .js bundles to scan`);
  }
  return bundles;
}

const chunkLoaderPlugin = {
  name: 'webpack-chunk-loader',
  setup(scan) {
    scan.onLoad({ filter: /\.js$/ }, async ({ path }) => ({
      contents: neutralizeChunkLoader(await readFile(path, 'utf8')),
      loader: 'js',
    }));
  },
};

export async function scanBundles(bundles) {
  const { metafile, warnings } = await build({
    entryPoints: bundles,
    bundle: true,
    packages: 'external',
    platform: 'node',
    format: 'esm',
    metafile: true,
    write: false,
    outdir: dirname(bundles[0]),
    logLevel: 'silent',
    logOverride: Object.fromEntries(
      UNTRACEABLE_IMPORTS.map((id) => [id, 'warning'])
    ),
    plugins: [chunkLoaderPlugin],
  });
  const untraceable = untraceableImports(warnings);
  if (untraceable.length > 0) {
    const sites = untraceable.map(
      ({ id, location }) => `${location.file}:${location.line} (${id})`
    );
    throw new Error(
      `imports the scan cannot trace to a package:\n${sites.join('\n')}`
    );
  }
  return externalPackages(metafile);
}

async function run() {
  const [project, outputDir] = process.argv.slice(2);
  if (!project || !outputDir) {
    throw new Error('usage: prune-runtime-deps.mjs <project> <output-dir>');
  }

  const externals = await scanBundles(listBundles(outputDir));
  const graph = await createProjectGraphAsync();
  const { name, version, type, packageManager, pnpm } = createPackageJson(
    project,
    graph,
    { isProduction: true }
  );
  const packageJson = {
    name,
    version,
    type,
    packageManager,
    pnpm,
    dependencies: lockedVersions(externals, graph.externalNodes),
  };
  const lockfileManager = detectPackageManager(workspaceRoot);

  writeFileSync(
    join(outputDir, 'package.json'),
    JSON.stringify(packageJson, null, 2)
  );
  writeFileSync(
    join(outputDir, getLockFileName(lockfileManager)),
    createLockFile(packageJson, graph, lockfileManager)
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await run();
}
