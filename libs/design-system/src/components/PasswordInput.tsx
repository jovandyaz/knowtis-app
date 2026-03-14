import { forwardRef, useCallback, useState } from 'react';

import { Eye, EyeOff } from 'lucide-react';

import { cn } from '../utils';
import { Button } from './Button';
import { Input } from './Input';

export type PasswordInputProps = Omit<
  React.ComponentProps<typeof Input>,
  'type'
>;

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, onKeyDown, ...props }, ref) => {
    const [showPassword, setShowPassword] = useState(false);

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Escape' && showPassword) {
          setShowPassword(false);
        }
        onKeyDown?.(e);
      },
      [showPassword, onKeyDown]
    );

    return (
      <div className="relative">
        <Input
          type={showPassword ? 'text' : 'password'}
          className={cn('pr-10', className)}
          ref={ref}
          onKeyDown={handleKeyDown}
          {...props}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-3 top-1/2 -translate-y-1/2 h-7 w-7 text-(--muted-foreground) hover:text-(--foreground) hover:bg-transparent"
          onClick={() => setShowPassword(!showPassword)}
          aria-label={showPassword ? 'Hide password' : 'Show password'}
          tabIndex={-1}
        >
          {showPassword ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
        </Button>
      </div>
    );
  }
);

PasswordInput.displayName = 'PasswordInput';
