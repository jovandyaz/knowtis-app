import { performLogout } from '@/auth/setup';

import { Button, EmptyState } from '@knowtis/design-system';

export function ForbiddenPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <EmptyState
        title="Access denied"
        description="This panel is restricted to administrators. Sign in with an admin account."
      >
        <Button onClick={performLogout}>Sign in with another account</Button>
      </EmptyState>
    </div>
  );
}
