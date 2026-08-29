#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(import.meta.url), '..', '..');
const skillsDir = join(repoRoot, '.agents', 'skills');
const manifestPath = join(skillsDir, '.knowtis-plugins-manifest.json');

function* walkFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walkFiles(path);
    else yield path;
  }
}

function integrity(dir) {
  const hash = createHash('sha256');
  for (const file of Array.from(walkFiles(dir)).sort()) {
    hash.update(relative(dir, file));
    hash.update('\0');
    hash.update(readFileSync(file));
    hash.update('\0');
  }
  return `sha256-${hash.digest('hex')}`;
}

if (!existsSync(manifestPath)) {
  process.stderr.write(
    'Missing .agents/skills/.knowtis-plugins-manifest.json\n'
  );
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const failures = [];
for (const [name, entry] of Object.entries(manifest)) {
  const dir = join(skillsDir, name);
  if (!existsSync(dir)) {
    failures.push(`${name}: missing skill directory`);
  } else if (!/^[a-f0-9]{40}$/.test(entry.revision ?? '')) {
    failures.push(`${name}: missing immutable source revision`);
  } else if (integrity(dir) !== entry.integrity) {
    failures.push(`${name}: content differs from the vendored manifest`);
  }
}

if (failures.length > 0) {
  process.stderr.write(
    `Agent skill drift detected:\n${failures.map((item) => `  - ${item}`).join('\n')}\n`
  );
  process.exit(1);
}

process.stdout.write(
  `Agent skills verified: ${Object.keys(manifest).length}\n`
);
