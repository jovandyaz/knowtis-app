import { Text } from '@react-email/components';

import { cn } from '../utils/cn';

interface TypographyProps {
  children: React.ReactNode;
  className?: string;
}

export const EmailTitle = ({ children, className }: TypographyProps) => {
  return (
    <Text
      className={cn('text-foreground text-xl font-bold m-0 mb-3', className)}
    >
      {children}
    </Text>
  );
};

export const BodyText = ({ children, className }: TypographyProps) => {
  return (
    <Text className={cn('text-foreground text-base m-0 mt-4', className)}>
      {children}
    </Text>
  );
};
