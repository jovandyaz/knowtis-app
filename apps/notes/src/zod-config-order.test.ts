import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const ENTRY_PATH = resolve(import.meta.dirname, 'main.tsx');
const ZOD_CONFIG_IMPORT = './lib/zod-config';
const IMPORT_SPECIFIER = /^import\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/gm;
const APP_OR_WORKSPACE_MODULE = /^(\.|@knowtis\/|@jovandyaz\/)/;

function importSpecifiers(): string[] {
  return [...readFileSync(ENTRY_PATH, 'utf8').matchAll(IMPORT_SPECIFIER)].map(
    ([, specifier]) => specifier
  );
}

describe('app entry (main.tsx)', () => {
  it('makes zod jitless before any app or workspace module can parse with it', () => {
    const firstAppImport = importSpecifiers().find((specifier) =>
      APP_OR_WORKSPACE_MODULE.test(specifier)
    );

    expect(firstAppImport).toBe(ZOD_CONFIG_IMPORT);
  });
});
