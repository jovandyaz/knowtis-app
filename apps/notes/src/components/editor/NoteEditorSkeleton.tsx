import { WorkspaceTabBarSkeleton } from '@/components/workspace/WorkspaceTabBarSkeleton';
import { useAIStore } from '@/stores/ai.store';

import { cn, Skeleton } from '@knowtis/design-system';

import { EditorCardSkeleton } from './EditorCardSkeleton';

const PROPERTY_CHIP_WIDTHS = ['w-24', 'w-20', 'w-16'] as const;
const TOOLBAR_BUTTON_COUNT = 6;

export function NoteEditorSkeleton({ label }: { label: string }) {
  const aiEnabled = useAIStore((s) => s.aiEnabled);

  return (
    <div className="mx-auto max-w-4xl">
      {aiEnabled && (
        <div aria-hidden="true">
          <WorkspaceTabBarSkeleton />
        </div>
      )}

      <Skeleton aria-hidden="true" className="mb-4 h-10 w-2/3" />

      <div aria-hidden="true" className="mb-6 flex flex-wrap gap-2">
        {PROPERTY_CHIP_WIDTHS.map((width) => (
          <Skeleton key={width} className={cn('h-7 rounded-full', width)} />
        ))}
      </div>

      <div
        aria-hidden="true"
        className="mx-auto mb-4 hidden w-fit gap-1 rounded-full border border-border/50 p-1 md:flex"
      >
        {Array.from({ length: TOOLBAR_BUTTON_COUNT }, (_, index) => (
          <Skeleton key={index} className="size-8 rounded-full" />
        ))}
      </div>

      <EditorCardSkeleton label={label} />
    </div>
  );
}
