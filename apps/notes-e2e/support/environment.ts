const HOST = '127.0.0.1';
const API_PREFIX = '/api/v1';
const COLLABORATION_PATH = '/collaboration';

export const E2E_PORT = {
  apiA: 3373,
  apiB: 3374,
  frontend: 4273,
  database: 5573,
  redis: 6573,
} as const;

export const E2E = {
  host: HOST,
  collaborationPath: COLLABORATION_PATH,
  frontend: `http://${HOST}:${E2E_PORT.frontend}`,
  apiA: `http://${HOST}:${E2E_PORT.apiA}${API_PREFIX}`,
  apiB: `http://${HOST}:${E2E_PORT.apiB}${API_PREFIX}`,
  websocketA: `ws://${HOST}:${E2E_PORT.apiA}`,
  socketA: `ws://${HOST}:${E2E_PORT.apiA}${COLLABORATION_PATH}`,
  socketB: `ws://${HOST}:${E2E_PORT.apiB}${COLLABORATION_PATH}`,
  database: `postgresql://knowtis_e2e:local_e2e_only@${HOST}:${E2E_PORT.database}/knowtis_sharing_e2e`,
  redis: `redis://${HOST}:${E2E_PORT.redis}`,
  ports: Object.values(E2E_PORT),
} as const;

export const CUTOFF_BUDGET_MS = 5000;
export const REDIS_OUTAGE_BEYOND_RETRY_BUDGET_MS = 15000;
export const QUIESCENCE_WINDOW_MS = 350;
export const TRAFFIC_INTERVAL_MS = 20;
export const BCRYPT_ROUNDS = 10;
export const LOGIN_THROTTLE_LIMIT = 5;
