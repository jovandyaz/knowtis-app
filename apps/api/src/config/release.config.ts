import { existsSync, readFileSync } from 'node:fs';

const REVISION_FILE = 'REVISION';

/**
 * The commit this build was deployed from, as the deploy wrote it into
 * `REVISION`; undefined when the file is absent or blank, as in local runs.
 */
export function readRevision(path: string = REVISION_FILE): string | undefined {
  if (!existsSync(path)) {
    return undefined;
  }
  const revision = readFileSync(path, 'utf8').trim();
  return revision === '' ? undefined : revision;
}

/** `ConfigModule` loader exposing the deployed commit as `RELEASE_SHA`. */
export function releaseConfig(path: string = REVISION_FILE): {
  RELEASE_SHA?: string;
} {
  const revision = readRevision(path);
  return revision ? { RELEASE_SHA: revision } : {};
}
