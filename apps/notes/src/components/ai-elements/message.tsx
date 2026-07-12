import type { ComponentProps, HTMLAttributes } from 'react';
import { memo } from 'react';

import { Streamdown } from 'streamdown';

import { cn } from '@knowtis/design-system';

import { hardenAssistantUrl } from './harden-assistant-url';

export type MessageProps = HTMLAttributes<HTMLDivElement> & {
  from: 'user' | 'assistant';
};

export const Message = ({ className, from, ...props }: MessageProps) => (
  <div
    className={cn(
      'group flex w-full max-w-[95%] flex-col gap-2',
      from === 'user' ? 'is-user ml-auto justify-end' : 'is-assistant',
      className
    )}
    {...props}
  />
);

export type MessageContentProps = HTMLAttributes<HTMLDivElement>;

export const MessageContent = ({
  className,
  children,
  ...props
}: MessageContentProps) => (
  <div
    className={cn(
      'flex w-fit min-w-0 max-w-full flex-col gap-2 overflow-hidden text-sm',
      'group-[.is-user]:ml-auto group-[.is-user]:rounded-2xl group-[.is-user]:rounded-br-sm group-[.is-user]:bg-primary/20 group-[.is-user]:px-3 group-[.is-user]:py-2 group-[.is-user]:text-foreground',
      'group-[.is-assistant]:text-foreground',
      className
    )}
    {...props}
  >
    {children}
  </div>
);

export type ResponseProps = ComponentProps<typeof Streamdown>;

export const Response = memo(({ className, ...props }: ResponseProps) => (
  <Streamdown
    className={cn(
      'size-full break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
      'prose prose-sm dark:prose-invert max-w-none',
      className
    )}
    urlTransform={hardenAssistantUrl}
    linkSafety={{ enabled: true }}
    {...props}
  />
));

Response.displayName = 'Response';
