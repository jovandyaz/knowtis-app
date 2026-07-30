import { useUpsertFeatureFlag } from '@knowtis/data-access-admin';
import { Badge, Switch } from '@knowtis/design-system';
import { flagMetaFor, type FeatureFlagDto } from '@knowtis/shared-types';

interface FlagGroupSectionProps {
  title: string;
  description?: string;
  flags: FeatureFlagDto[];
}

function FlagSwitch({ flag, label }: { flag: FeatureFlagDto; label: string }) {
  const upsert = useUpsertFeatureFlag();

  return (
    <Switch
      checked={flag.enabled}
      aria-label={label}
      disabled={upsert.isPending}
      onCheckedChange={(enabled) =>
        upsert.mutate({
          key: flag.key,
          enabled,
          ...(flag.description !== null && {
            description: flag.description,
          }),
        })
      }
    />
  );
}

/**
 * Renders one titled group of flag toggles, each owning its own upsert mutation
 * so consumers must not wire one; renders nothing when the group is empty.
 */
export function FlagGroupSection({
  title,
  description,
  flags,
}: FlagGroupSectionProps) {
  if (flags.length === 0) {
    return null;
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-sm font-semibold">{title}</h2>
        {description ? (
          <p className="text-xs text-(--muted-foreground)">{description}</p>
        ) : null}
      </div>
      <ul className="flex flex-col divide-y divide-(--border) rounded-md border border-(--border)">
        {flags.map((flag) => {
          const meta = flagMetaFor(flag.key);
          return (
            <li key={flag.key} className="flex items-center gap-3 p-3">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  {meta.label}
                  {meta.requiresEnv ? (
                    <Badge variant="outline">requires {meta.requiresEnv}</Badge>
                  ) : null}
                </div>
                {meta.label !== flag.key ? (
                  <span className="truncate font-mono text-xs text-(--muted-foreground)">
                    {flag.key}
                  </span>
                ) : null}
                {flag.description ? (
                  <span className="text-xs text-(--muted-foreground)">
                    {flag.description}
                  </span>
                ) : null}
              </div>
              <FlagSwitch flag={flag} label={meta.label} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
