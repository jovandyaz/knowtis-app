import type { ComponentProps, HTMLAttributes } from 'react';
import { useCallback } from 'react';

import { ArrowDownIcon } from 'lucide-react';
import { StickToBottom, useStickToBottomContext } from 'use-stick-to-bottom';

import { Button, cn } from '@knowtis/design-system';

export type ConversationProps = ComponentProps<typeof StickToBottom>;

export const Conversation = ({ className, ...props }: ConversationProps) => (
  <StickToBottom
    className={cn('relative flex-1 overflow-y-auto', className)}
    initial="smooth"
    resize="smooth"
    {...props}
  />
);

export type ConversationContentProps = HTMLAttributes<HTMLDivElement> & {
  /** Attributes of the element that scrolls, which is also the log. */
  logProps?: HTMLAttributes<HTMLDivElement>;
};

const SCROLLER_STYLE = {
  height: '100%',
  width: '100%',
  scrollbarGutter: 'stable both-edges',
} as const;

// `StickToBottom.Content` renders the same two elements but takes no
// attributes for the one that scrolls, which has to carry the log's role,
// name and focus.
export const ConversationContent = ({
  className,
  logProps,
  ...props
}: ConversationContentProps) => {
  const { scrollRef, contentRef } = useStickToBottomContext();
  return (
    <div role="log" {...logProps} ref={scrollRef} style={SCROLLER_STYLE}>
      <div
        {...props}
        ref={contentRef}
        className={cn('flex flex-col gap-5 p-3', className)}
      />
    </div>
  );
};

export type ConversationScrollButtonProps = ComponentProps<typeof Button>;

export const ConversationScrollButton = ({
  className,
  ...props
}: ConversationScrollButtonProps) => {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();

  const handleScrollToBottom = useCallback(() => {
    scrollToBottom();
  }, [scrollToBottom]);

  return (
    !isAtBottom && (
      <Button
        aria-label="Scroll to latest message"
        className={cn(
          'absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full shadow-md',
          className
        )}
        size="icon"
        type="button"
        variant="outline"
        {...props}
        onClick={handleScrollToBottom}
      >
        <ArrowDownIcon className="size-4" />
      </Button>
    )
  );
};
