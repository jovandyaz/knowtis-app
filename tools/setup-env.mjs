import { copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Copy `<dir>/.env.example` to `<dir>/.env` if `.env` does not yet exist.
 * Idempotent — safe to call repeatedly. Never overwrites a user-edited `.env`.
 */
export function scaffoldEnv(dir) {
  const examplePath = join(dir, '.env.example');
  const envPath = join(dir, '.env');

  if (!existsSync(examplePath)) {
    return { created: false, missingExample: true, path: envPath };
  }

  if (existsSync(envPath)) {
    return { created: false, path: envPath };
  }

  copyFileSync(examplePath, envPath);
  return { created: true, path: envPath };
}
