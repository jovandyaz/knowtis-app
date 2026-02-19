import type { ReactNode } from 'react';

import { Card } from '@knowtis/design-system';

interface AuthPageLayoutProps {
  children: ReactNode;
}

export function AuthPageLayout({ children }: AuthPageLayoutProps) {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md border-border/50 bg-card/95 backdrop-blur-sm">
        {children}
      </Card>
    </div>
  );
}
