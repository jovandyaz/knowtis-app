import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SKIP_DIRS = new Set(['node_modules', 'dist', '.nx', '.git', 'coverage']);

/**
 * Nx runs each project's inferred `lint` target as `eslint .` from the project
 * directory, so ESLint resolves that project's own `eslint.config.mjs`. Any
 * path-scoped block the root config contributes must still match from there.
 */
function projectsWithOwnConfig() {
  return readdirSync(workspaceRoot, { withFileTypes: true, recursive: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name === 'eslint.config.mjs' &&
        !relative(workspaceRoot, entry.parentPath)
          .split('/')
          .some((segment) => SKIP_DIRS.has(segment))
    )
    .map((entry) => entry.parentPath)
    .sort();
}

async function rulesFor(projectDir, relativeFile) {
  const eslint = new ESLint({ cwd: projectDir });
  const config = await eslint.calculateConfigForFile(
    join(projectDir, relativeFile)
  );
  return config?.rules ?? {};
}

const severity = (rule) => (Array.isArray(rule) ? rule[0] : rule);
const isNestProject = (name) =>
  name === 'apps/api' || /^packages\/[^/]+-nestjs$/.test(name);

const projects = projectsWithOwnConfig();

test('finds the projects that ship their own eslint config', () => {
  assert.ok(projects.length > 0, 'no eslint.config.mjs found below the root');
});

for (const projectDir of projects) {
  const projectName = relative(workspaceRoot, projectDir);

  if (isNestProject(projectName)) {
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
      assert.equal(severity(rules['@typescript-eslint/no-empty-function']), 0);
    });
  } else {
    test(`${projectName}: React hooks and a11y rules apply from the project directory`, async () => {
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
      assert.equal(
        severity(rules['jsx-a11y/alt-text']),
        2,
        'jsx-a11y recommended must apply to .tsx files'
      );
    });
  }
}
