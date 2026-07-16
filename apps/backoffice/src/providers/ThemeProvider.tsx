import type { ComponentProps, ReactNode } from 'react';

import { ThemeProvider as NextThemesProvider } from 'next-themes';

interface ThemeProviderProps extends ComponentProps<typeof NextThemesProvider> {
  children: ReactNode;
}

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
