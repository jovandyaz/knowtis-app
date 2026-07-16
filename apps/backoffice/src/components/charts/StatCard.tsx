import { Card } from '@knowtis/design-system';

interface StatCardProps {
  label: string;
  value: string;
  hint?: string;
}

export function StatCard({ label, value, hint }: StatCardProps) {
  return (
    <Card className="flex flex-col gap-1 p-4">
      <span className="text-xs text-(--muted-foreground)">{label}</span>
      <span className="text-xl font-semibold">{value}</span>
      {hint ? (
        <span className="text-xs text-(--muted-foreground)">{hint}</span>
      ) : null}
    </Card>
  );
}
