import type { ComponentProps } from 'react';

import { Toaster as SonnerToaster } from 'sonner';

const TOAST_DURATION_MS = 5000;

type ToasterPosition = ComponentProps<typeof SonnerToaster>['position'];

interface ToasterProps {
  position?: ToasterPosition;
}

export function Toaster({ position = 'bottom-right' }: ToasterProps) {
  return (
    <SonnerToaster
      position={position}
      richColors
      closeButton
      toastOptions={{
        duration: TOAST_DURATION_MS,
      }}
    />
  );
}
