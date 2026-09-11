import {
  Card,
  CardContent,
  CardHeader,
  Skeleton,
} from '@knowtis/design-system';

export function NoteCardSkeleton() {
  return (
    <Card aria-hidden="true" className="h-[200px] overflow-hidden">
      <CardHeader className="pb-2">
        <Skeleton className="h-6 w-3/4" />
      </CardHeader>
      <CardContent>
        <Skeleton className="mb-2 h-4 w-full" />
        <Skeleton className="mb-4 h-4 w-2/3" />
        <div className="flex items-center gap-2 pt-4">
          <Skeleton className="h-3 w-3 rounded-full" />
          <Skeleton className="h-3 w-24" />
        </div>
      </CardContent>
    </Card>
  );
}
