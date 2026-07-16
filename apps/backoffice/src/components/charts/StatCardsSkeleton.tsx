import { Card, Skeleton } from '@knowtis/design-system';

interface StatCardsSkeletonProps {
  count?: number;
}

export function StatCardsSkeleton({ count = 4 }: StatCardsSkeletonProps) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: count }, (_, index) => (
        <Card key={index} className="flex flex-col gap-2 p-4">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-6 w-24" />
        </Card>
      ))}
    </div>
  );
}
