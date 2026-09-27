import { Link } from '@tanstack/react-router';

import { ROUTES } from '@/config/routes.config';

import { buttonVariants, EmptyState } from '@knowtis/design-system';

export function NotFoundPage() {
  return (
    <EmptyState
      title="Page not found"
      description="This page does not exist or has moved."
    >
      <Link to={ROUTES.ROOT} className={buttonVariants({ size: 'sm' })}>
        Back to dashboard
      </Link>
    </EmptyState>
  );
}
