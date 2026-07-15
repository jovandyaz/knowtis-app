import { EmptyState } from '@knowtis/design-system';

export function DashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Overview</h1>
      <EmptyState
        title="No panels yet"
        description="Users, AI metrics, and feature flags arrive in the next release."
      />
    </div>
  );
}
