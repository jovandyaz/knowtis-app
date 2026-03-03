import type { ReactNode } from 'react';

import { Card } from '@knowtis/design-system';

import { KnowtisLogo } from '../components/layout/KnowtisLogo';

interface AuthPageLayoutProps {
  children: ReactNode;
}

export function AuthPageLayout({ children }: AuthPageLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <KnowtisLogo className="mb-8 h-10 w-auto text-[oklch(0.58_0.24_290)]" />
      <Card className="w-full max-w-md border-border/50 bg-card/95 backdrop-blur-sm">
        {children}
      </Card>
    </div>
  );
}
