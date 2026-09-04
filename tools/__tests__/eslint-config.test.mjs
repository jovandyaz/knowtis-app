import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Nx runs each project's inferred `lint` target as `eslint .` from the project
 * directory, so ESLint resolves that project's own `eslint.config.mjs`. Any
 * path-scoped block the root config contributes must still match from there.
 */
function projectsWithOwnConfig(parent) {
  const dir = join(workspaceRoot, parent);
  return readdirSync(dir)
    .map((name) => join(dir, name))
    .filter((projectDir) => existsSync(join(projectDir, 'eslint.config.mjs')));
}

async function rulesFor(projectDir, relativeFile) {
  const eslint = new ESLint({ cwd: projectDir });
  const config = await eslint.calculateConfigForFile(
    join(projectDir, relativeFile)
  );
  return config?.rules ?? {};
}

const severity = (rule) => (Array.isArray(rule) ? rule[0] : rule);

for (const projectDir of projectsWithOwnConfig('packages')) {
  const isNest = projectDir.endsWith('-nestjs');
  const projectName = projectDir.slice(workspaceRoot.length + 1);

  if (isNest) {
    test(`${projectName}: NestJS overrides apply from the project directory`, async () => {
      const rules = await rulesFor(projectDir, 'src/probe.ts');
      assert.equal(
        severity(rules['@typescript-eslint/consistent-type-imports']),
        0,
        'consistent-type-imports must be off for NestJS DI'
      );
      assert.equal(
        severity(rules['@typescript-eslint/no-extraneous-class']),
        0
      );
    });
  } else {
    test(`${projectName}: React hooks rules apply from the project directory`, async () => {
      const rules = await rulesFor(projectDir, 'src/probe.tsx');
      assert.equal(
        severity(rules['react-hooks/rules-of-hooks']),
        2,
        'react-hooks/rules-of-hooks must be an error'
      );
      assert.ok(
        rules['react-hooks/refs'],
        'react-hooks/refs must be configured'
      );
    });
  }
}

for (const projectDir of projectsWithOwnConfig('apps')) {
  const projectName = projectDir.slice(workspaceRoot.length + 1);
  const isApi = projectDir.endsWith('/api');
  test(`${projectName}: ${isApi ? 'NestJS' : 'React'} overrides apply from the project directory`, async () => {
    const rules = await rulesFor(
      projectDir,
      isApi ? 'src/probe.ts' : 'src/probe.tsx'
    );
    if (isApi) {
      assert.equal(
        severity(rules['@typescript-eslint/consistent-type-imports']),
        0
      );
    } else {
      assert.equal(severity(rules['react-hooks/rules-of-hooks']), 2);
    }
  });
}
