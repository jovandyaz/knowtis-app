import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { workspaceRoot } from '@nx/devkit';

import { BCRYPT_ROUNDS, E2E, E2E_PORT } from './environment';

async function requireFreePort(port: number): Promise<void> {
  await new Promise<void>((done, reject) => {
    const server = createServer();
    server.once('error', () =>
      reject(new Error(`E2E port ${port} is occupied`))
    );
    server.listen(port, '127.0.0.1', () => server.close(() => done()));
  });
}

export default async function globalSetup() {
  // Nest and Vite can load files even when the child environment is allowlisted.
  for (const directory of ['', 'apps/api', 'apps/notes', 'apps/notes-e2e']) {
    const files = await readdir(resolve(workspaceRoot, directory));
    const dotenv = files.find(
      (name) =>
        (/^\.env(?:\.|$)/.test(name) || /^\..+\.env(?:\.|$)/.test(name)) &&
        !/(?:^|\.)(example|sample|template)(?:\.|$)/.test(name)
    );
    if (dotenv) {
      throw new Error(
        `Sharing E2E requires a worktree without local dotenv files: ${directory}/${dotenv}`
      );
    }
  }
  await Promise.all(E2E.ports.map(requireFreePort));
  const project = `knowtis-sharing-e2e-${randomBytes(4).toString('hex')}`;
  const output = resolve(
    workspaceRoot,
    'dist/.playwright/sharing-runtime',
    project
  );
  await mkdir(output, { recursive: true });
  const composeFile = resolve(import.meta.dirname, 'compose.yml');
  const composeArgs = ['compose', '-p', project, '-f', composeFile];
  const environment: NodeJS.ProcessEnv = {
    PATH: process.env['PATH'],
    HOME: process.env['HOME'],
    TMPDIR: process.env['TMPDIR'],
    NODE_ENV: 'test',
    DATABASE_URL: E2E.database,
    REDIS_URL: E2E.redis,
    JWT_SECRET: randomBytes(48).toString('base64'),
    JWT_REFRESH_SECRET: randomBytes(48).toString('base64'),
    TOKEN_HASH_KEY: randomBytes(32).toString('base64'),
    FRONTEND_URL: E2E.frontend,
    BACKOFFICE_URL: 'http://127.0.0.1:4473',
    EMAIL_PROVIDER: 'console',
    BCRYPT_ROUNDS: String(BCRYPT_ROUNDS),
    NX_DAEMON: 'false',
    NX_LOAD_DOT_ENV_FILES: 'false',
    NX_ISOLATE_PLUGINS: 'false',
    NX_PARALLEL: '1',
    VITEST_MAX_WORKERS: '2',
    VITE_API_URL: E2E.apiA,
    VITE_WS_URL: E2E.websocketA,
    VITE_COLLABORATION_MODE: 'websocket',
  };
  const children: ChildProcess[] = [];
  const logStreams: ReturnType<typeof createWriteStream>[] = [];
  let cleanupStarted = false;
  let composeStarted = false;

  function start(name: string, command: string, args: string[], extra = {}) {
    const log = createWriteStream(resolve(output, `${name}.log`), {
      mode: 0o600,
    });
    logStreams.push(log);
    const child = spawn(command, args, {
      cwd: workspaceRoot,
      env: { ...environment, ...extra },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    });
    child.once('error', (error) => log.write(`${name}: ${error.message}\n`));
    child.stdout?.pipe(log, { end: false });
    child.stderr?.pipe(log, { end: false });
    children.push(child);
    return child;
  }

  async function run(
    name: string,
    command: string,
    args: string[],
    extra = {}
  ) {
    const child = start(name, command, args, extra);
    await new Promise<void>((done, reject) => {
      child.once('error', reject);
      child.once('exit', (code) =>
        code === 0
          ? done()
          : reject(new Error(`${name} failed (${code}); inspect ${output}`))
      );
    });
  }

  async function ready(url: string, child: ChildProcess) {
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new Error(
          `E2E service exited before readiness; inspect ${output}`
        );
      }
      const response = await fetch(url, {
        signal: AbortSignal.timeout(1000),
      }).catch(() => null);
      if (response?.ok) {
        return;
      }
      await delay(100);
    }
    throw new Error(`E2E service did not become ready; inspect ${output}`);
  }

  async function cleanup() {
    if (cleanupStarted) {
      return;
    }
    cleanupStarted = true;
    for (const child of children.toReversed()) {
      if (child.exitCode !== null || child.signalCode !== null) {
        continue;
      }
      if (!child.pid) {
        continue;
      }
      const signal = (value: NodeJS.Signals) => {
        if (process.platform === 'win32') {
          child.kill(value);
        } else if (child.pid) {
          try {
            process.kill(-child.pid, value);
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
              throw error;
            }
          }
        }
      };
      signal('SIGTERM');
      await Promise.race([
        new Promise<void>((done) => child.once('exit', () => done())),
        delay(5000, undefined, { ref: false }).then(() => {
          if (child.exitCode === null && child.signalCode === null) {
            signal('SIGKILL');
          }
        }),
      ]);
    }
    try {
      if (composeStarted) {
        await run('compose-down', 'docker', [
          ...composeArgs,
          'down',
          '--volumes',
        ]);
      }
    } finally {
      await Promise.all(
        logStreams.map(
          (log) =>
            new Promise<void>((done) => {
              log.end(done);
            })
        )
      );
    }
  }

  try {
    composeStarted = true;
    await run('compose-up', 'docker', [...composeArgs, 'up', '-d', '--wait']);
    await run('migrations', 'pnpm', ['nx', 'db:migrate:run', 'api']);
    await run(
      'build',
      'pnpm',
      [
        'nx',
        'run-many',
        '-t',
        'build',
        '-p',
        'api,notes',
        '--configuration=production',
        '--parallel=1',
        '--skip-nx-cache',
      ],
      { NODE_ENV: 'production' }
    );
    const apiA = start('api-a', process.execPath, ['dist/apps/api/main.js'], {
      PORT: String(E2E_PORT.apiA),
    });
    const apiB = start('api-b', process.execPath, ['dist/apps/api/main.js'], {
      PORT: String(E2E_PORT.apiB),
    });
    await Promise.all([
      ready(`${E2E.apiA}/health/ready`, apiA),
      ready(`${E2E.apiB}/health/ready`, apiB),
    ]);
    const preview = start(
      'notes',
      'pnpm',
      [
        'nx',
        'run',
        'notes-e2e:serve-preview',
        `--host=${E2E.host}`,
        `--port=${E2E_PORT.frontend}`,
      ],
      { NODE_ENV: 'production' }
    );
    await ready(E2E.frontend, preview);
    process.env['SHARING_E2E_PROJECT'] = project;
    process.env['SHARING_E2E_RUNTIME'] = output;
    await writeFile(
      resolve(output, 'services.json'),
      JSON.stringify({
        project,
        composeFile,
        apiA: apiA.pid,
        apiB: apiB.pid,
      }),
      { mode: 0o600 }
    );
    return cleanup;
  } catch (error) {
    await cleanup().catch(() => undefined);
    throw error;
  }
}
