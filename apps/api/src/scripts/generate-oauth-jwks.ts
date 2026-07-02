import { randomUUID } from 'node:crypto';

import { exportJWK, generateKeyPair } from 'jose';

async function main(): Promise<void> {
  const { privateKey } = await generateKeyPair('ES256', { extractable: true });
  const jwk = await exportJWK(privateKey);
  jwk.kid = randomUUID();
  jwk.alg = 'ES256';
  jwk.use = 'sig';
  process.stdout.write(`${JSON.stringify({ keys: [jwk] })}\n`);
}

main().catch((error) => {
  console.error('Failed to generate JWKS:', error);
  process.exit(1);
});
