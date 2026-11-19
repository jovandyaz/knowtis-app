import { config as loadEnv } from 'dotenv';

import { resolveTestEnv } from './test-env';

loadEnv({ path: ['.env.local', '.env'], quiet: true });
// Unset test URLs land as '' rather than being deleted: dotenv and
// @nestjs/config never replace a key already in process.env, so .env's dev URL stays out.
Object.assign(process.env, resolveTestEnv(process.env));
