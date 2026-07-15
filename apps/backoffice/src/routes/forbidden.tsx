import { createFileRoute } from '@tanstack/react-router';

import { ForbiddenPage } from '@/pages/ForbiddenPage';

export const Route = createFileRoute('/forbidden')({
  component: ForbiddenPage,
});
