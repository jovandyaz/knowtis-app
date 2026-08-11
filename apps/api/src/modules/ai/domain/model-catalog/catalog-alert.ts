import type { CatalogAlertKind } from '@knowtis/shared-types';

/** An upstream change on a catalog model that needs an admin decision; open while `resolvedAt` is null. */
export interface CatalogAlert {
  readonly id: number;
  readonly modelId: string;
  readonly kind: CatalogAlertKind;
  readonly detail: string;
  readonly createdAt: Date;
  readonly resolvedAt: Date | null;
}
