import type { ComponentProps } from 'react';

import { motion } from 'motion/react';

import { Button, Card, cn } from '@knowtis/design-system';

export type ConfirmationProps = ComponentProps<typeof Card>;

export const Confirmation = ({ className, ...props }: ConfirmationProps) => (
  <motion.div
    initial={{ opacity: 0, y: 6 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.18, ease: 'easeOut' }}
  >
    <Card
      className={cn(
        'min-w-0 max-w-full overflow-hidden border-l-2 border-l-primary/70 shadow-sm',
        className
      )}
      {...props}
    />
  </motion.div>
);

export type ConfirmationActionsProps = ComponentProps<'div'>;

export const ConfirmationActions = ({
  className,
  ...props
}: ConfirmationActionsProps) => (
  <div
    className={cn(
      'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end',
      className
    )}
    {...props}
  />
);

export type ConfirmationActionProps = ComponentProps<typeof Button>;

export const ConfirmationAction = ({
  className,
  ...props
}: ConfirmationActionProps) => (
  <Button type="button" size="sm" className={cn('h-8', className)} {...props} />
);
