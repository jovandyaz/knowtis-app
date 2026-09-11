import { cn, DocumentSkeleton } from '@knowtis/design-system';

import {
  EDITOR_CONTAINER_CLASSES,
  EDITOR_MIN_HEIGHT,
  EDITOR_PADDING,
} from './editor-container.styles';

const EDITOR_BODY_LINES = 8;

export function EditorCardSkeleton({ label }: { label: string }) {
  return (
    <div
      className={cn(
        EDITOR_CONTAINER_CLASSES,
        EDITOR_PADDING,
        EDITOR_MIN_HEIGHT
      )}
    >
      <DocumentSkeleton
        showTitle={false}
        lines={EDITOR_BODY_LINES}
        label={label}
      />
    </div>
  );
}
