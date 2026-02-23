import { Button as BaseButton } from '@react-email/components';

import { cn } from '../utils/cn';

interface ButtonProps {
  href: string;
  children: React.ReactNode;
  className?: string;
}

export const Button = ({ href, children, className }: ButtonProps) => {
  return (
    <BaseButton
      href={href}
      className={cn(
        'block w-full',
        'sm:inline-block sm:w-auto',
        'px-6 py-3 rounded-md text-base font-semibold text-center box-border',
        'bg-primary text-white border border-solid border-transparent',
        className
      )}
    >
      {children}
    </BaseButton>
  );
};
