import { cn } from '@knowtis/design-system';
import type { BucketFilter } from '@knowtis/shared-types';

const DOT_CLASSES: Record<BucketFilter, string> = {
  inbox: 'rounded-[2px] border-[1.5px] border-dashed border-muted-foreground',
  projects: 'rounded-full bg-bucket-projects',
  areas: 'rounded-full bg-bucket-areas',
  resources: 'rounded-full bg-bucket-resources',
  archive: 'rounded-full border-[1.5px] border-bucket-archive',
};

interface BucketDotProps {
  bucket: BucketFilter;
  className?: string;
}

export function BucketDot({ bucket, className }: BucketDotProps) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-block size-[9px] shrink-0',
        DOT_CLASSES[bucket],
        className
      )}
    />
  );
}
