import type { ComponentProps } from 'react';

import { Toaster as SonnerToaster } from 'sonner';

const TOAST_DURATION_MS = 5000;

type SonnerToasterProps = ComponentProps<typeof SonnerToaster>;

interface ToasterProps {
  position?: SonnerToasterProps['position'];
  /** Distance from the viewport edges; accepts CSS lengths such as `calc()`. */
  offset?: SonnerToasterProps['offset'] | undefined;
}

export function Toaster({ position = 'bottom-right', offset }: ToasterProps) {
  return (
    <SonnerToaster
      position={position}
      {...(offset !== undefined && { offset })}
      richColors
      closeButton
      toastOptions={{
        duration: TOAST_DURATION_MS,
      }}
    />
  );
}
