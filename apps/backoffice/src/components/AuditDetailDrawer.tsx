import {
  computeFieldChanges,
  formatTarget,
  formatValue,
} from '@/lib/audit-diff';

import type { AuditEntry } from '@knowtis/data-access-admin';
import {
  Badge,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@knowtis/design-system';

interface AuditDetailDrawerProps {
  entry: AuditEntry | null;
  onClose: () => void;
}

export function AuditDetailDrawer({ entry, onClose }: AuditDetailDrawerProps) {
  const changes = entry ? computeFieldChanges(entry.before, entry.after) : [];

  return (
    <Dialog open={entry !== null} onOpenChange={(open) => !open && onClose()}>
      {entry ? (
        <DialogContent side="right">
          <DialogHeader>
            <DialogTitle>{entry.action}</DialogTitle>
            <DialogDescription>
              {entry.actorEmail ?? entry.actorId} ·{' '}
              {entry.createdAt.toLocaleString()}
            </DialogDescription>
          </DialogHeader>

          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-(--muted-foreground)">Target</dt>
            <dd>{formatTarget(entry)}</dd>
          </dl>

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium text-(--muted-foreground)">
              Changed fields
            </h3>
            {changes.length === 0 ? (
              <p className="text-sm text-(--muted-foreground)">
                No field-level changes recorded.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {changes.map((change) => (
                  <li
                    key={change.key}
                    className="flex flex-wrap items-center gap-2 text-sm"
                  >
                    <span className="font-medium">{change.key}</span>
                    <Badge variant="destructive" className="line-through">
                      {formatValue(change.before)}
                    </Badge>
                    <span aria-hidden="true">→</span>
                    <Badge variant="success">{formatValue(change.after)}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <details className="text-sm">
            <summary className="cursor-pointer text-(--muted-foreground)">
              Full JSON
            </summary>
            <pre className="mt-2 overflow-x-auto rounded bg-(--muted) p-3 text-xs">
              {JSON.stringify(
                { before: entry.before, after: entry.after },
                null,
                2
              )}
            </pre>
          </details>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
