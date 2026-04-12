import type { ReactNode } from 'react';

import { Loader2 } from 'lucide-react';

import { Button, type ButtonProps } from './Button';

export interface LoadingButtonProps extends ButtonProps {
  loading: boolean;
  loadingText: string;
  loadingIcon?: ReactNode;
}

export function LoadingButton({
  loading,
  loadingText,
  loadingIcon,
  children,
  disabled,
  ...props
}: LoadingButtonProps) {
  return (
    <Button disabled={loading || disabled} {...props}>
      {loading ? (
        <>
          {loadingIcon ?? <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {loadingText}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
