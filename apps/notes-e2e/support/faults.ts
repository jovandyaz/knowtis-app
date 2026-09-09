import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

import { z } from 'zod';

const execute = promisify(execFile);

/** The setup-created manifest identifies only this run's disposable services. */
export async function compose(...args: string[]) {
  const runtime = process.env['SHARING_E2E_RUNTIME'];
  if (!runtime) {
    throw new Error('Sharing E2E runtime was not initialized');
  }
  const manifest = z
    .object({
      project: z.string().regex(/^knowtis-sharing-e2e-[a-f0-9]{8}$/),
      composeFile: z.string(),
    })
    .parse(
      JSON.parse(await readFile(resolve(runtime, 'services.json'), 'utf8'))
    );
  await execute(
    'docker',
    ['compose', '-p', manifest.project, '-f', manifest.composeFile, ...args],
    {
      timeout: 30_000,
    }
  );
}
