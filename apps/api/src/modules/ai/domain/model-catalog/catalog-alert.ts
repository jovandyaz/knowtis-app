import type { CatalogAlertKind } from '@knowtis/shared-types';

/** An upstream change on a catalog model that needs an admin decision; open while `resolvedAt` is null. */
export interface CatalogAlert {
  id: number;
  modelId: string;
  kind: CatalogAlertKind;
  detail: string;
  createdAt: Date;
  resolvedAt: Date | null;
}
