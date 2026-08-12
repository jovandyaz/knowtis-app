import type { CatalogAlert } from '@knowtis/data-access-admin';
import { Badge, Button, Card } from '@knowtis/design-system';
import type { CatalogAlertKind } from '@knowtis/shared-types';

const ALERT_KIND_LABELS: Record<string, string> = {
  deprecation: 'Deprecation',
  price_drift: 'Price drift',
  unavailable: 'Unavailable',
} satisfies Record<CatalogAlertKind, string>;

interface CatalogAlertsProps {
  alerts: CatalogAlert[];
  disabled: boolean;
  onResolve: (alertId: number) => void;
}

export function CatalogAlerts({
  alerts,
  disabled,
  onResolve,
}: CatalogAlertsProps) {
  if (alerts.length === 0) {
    return null;
  }

  return (
    <Card className="flex min-w-0 flex-col gap-2 p-4">
      <h3 className="text-sm font-medium text-(--muted-foreground)">
        Open alerts
      </h3>
      <ul className="flex flex-col gap-2">
        {alerts.map((alert) => (
          <li key={alert.id} className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">
              {ALERT_KIND_LABELS[alert.kind] ?? alert.kind}
            </Badge>
            <span className="font-mono text-xs text-(--muted-foreground)">
              {alert.modelId}
            </span>
            <span className="min-w-0 flex-1 basis-48 wrap-break-word text-sm">
              {alert.detail}
            </span>
            <span className="text-xs text-(--muted-foreground)">
              {alert.createdAt.toLocaleDateString()}
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={disabled}
              aria-label={`Resolve ${alert.kind} alert for ${alert.modelId}`}
              onClick={() => onResolve(alert.id)}
            >
              Resolve
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
