/* eslint-disable no-console */
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { INDEX_PROVIDERS, ModelIndexCatalog } from '@knowtis/ai-gateway';

import { providerBatches } from '../modules/ai/infrastructure/catalog/model-index.writer';
import { ModelsDevHttpClient } from '../modules/ai/infrastructure/catalog/models-dev.client';
import { OpenRouterModelsHttpClient } from '../modules/ai/infrastructure/catalog/openrouter-models.client';
import {
  renderModelIndexSnapshot,
  snapshotRefusals,
} from './model-index-snapshot';

const SNAPSHOT_PATH = resolve(
  __dirname,
  '../../../../packages/ai-gateway/src/catalog/model-index.snapshot.ts'
);

async function main(): Promise<void> {
  const [modelsDev, openRouter] = await Promise.all([
    new ModelsDevHttpClient().fetchCatalog(),
    new OpenRouterModelsHttpClient().fetchModels(),
  ]);
  const catalog = new ModelIndexCatalog(
    providerBatches(openRouter, modelsDev).flatMap((batch) => batch.rows)
  );

  const refusals = snapshotRefusals(modelsDev, openRouter, catalog);
  if (refusals.length > 0) {
    console.error('Refusing to write the model index snapshot:');
    for (const refusal of refusals) {
      console.error(`  ${refusal}`);
    }
    process.exitCode = 1;
    return;
  }

  await writeFile(SNAPSHOT_PATH, renderModelIndexSnapshot(catalog.all()));
  const perProvider = INDEX_PROVIDERS.map(
    (provider) =>
      `${provider} ${catalog.all().filter((row) => row.provider === provider).length}`
  ).join(', ');
  console.log(
    `Wrote ${catalog.size} models (${perProvider}) to ${SNAPSHOT_PATH}`
  );
}

main().catch((error) => {
  console.error('[refresh-model-index-snapshot] failed:', error);
  process.exitCode = 1;
});
