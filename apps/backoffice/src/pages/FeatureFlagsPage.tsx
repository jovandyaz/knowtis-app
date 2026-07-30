import { FlagGroupSection } from '@/components/flags/FlagGroupSection';
import { TableSkeleton } from '@/components/TableSkeleton';

import { useFeatureFlags } from '@knowtis/data-access-feature-flags';
import { EmptyState, ErrorState } from '@knowtis/design-system';
import {
  FLAG_DOMAIN,
  FLAG_GROUP,
  flagMetaFor,
  type FlagGroup,
} from '@knowtis/shared-types';

const PRODUCT_GROUPS: ReadonlyArray<{
  group: FlagGroup;
  title: string;
  description: string;
}> = [
  {
    group: FLAG_GROUP.RELEASE,
    title: 'Release',
    description: 'Feature rollouts — retire once fully rolled out.',
  },
  {
    group: FLAG_GROUP.OPS,
    title: 'Operations',
    description: 'Operational toggles that protect the platform.',
  },
  {
    group: FLAG_GROUP.PERMISSION,
    title: 'Permissions',
    description: 'Gates controlling which users get a feature.',
  },
  {
    group: FLAG_GROUP.OTHER,
    title: 'Other',
    description: 'Flags without catalog metadata.',
  },
];

export function FeatureFlagsPage() {
  const flags = useFeatureFlags();
  const productFlags = (flags.data ?? []).filter(
    (flag) => flagMetaFor(flag.key).domain === FLAG_DOMAIN.PRODUCT
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Feature Flags</h1>
        <p className="text-sm text-(--muted-foreground)">
          Product flags. AI operational controls live in AI Config.
        </p>
      </div>
      {flags.isError ? (
        <ErrorState
          message="Could not load feature flags."
          onRetry={() => void flags.refetch()}
          fullHeight={false}
        />
      ) : flags.isLoading ? (
        <TableSkeleton columns={4} />
      ) : productFlags.length === 0 ? (
        <EmptyState
          title="No flags"
          description="Flags appear once they are created via the API."
        />
      ) : (
        PRODUCT_GROUPS.map(({ group, title, description }) => (
          <FlagGroupSection
            key={group}
            title={title}
            description={description}
            flags={productFlags.filter(
              (flag) => flagMetaFor(flag.key).group === group
            )}
          />
        ))
      )}
    </div>
  );
}
