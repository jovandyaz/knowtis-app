export const E2E = {
  frontend: 'http://127.0.0.1:4273',
  apiA: 'http://127.0.0.1:3373/api/v1',
  apiB: 'http://127.0.0.1:3374/api/v1',
  socketA: 'ws://127.0.0.1:3373/collaboration',
  socketB: 'ws://127.0.0.1:3374/collaboration',
  database:
    'postgresql://knowtis_e2e:local_e2e_only@127.0.0.1:5573/knowtis_sharing_e2e',
  redis: 'redis://127.0.0.1:6573',
  ports: [3373, 3374, 4273, 5573, 6573],
} as const;
