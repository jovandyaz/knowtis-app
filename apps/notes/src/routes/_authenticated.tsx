import { createFileRoute, redirect } from '@tanstack/react-router';

import { ROUTES } from '@/config';

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: () => {
    throw redirect({ to: ROUTES.ROOT });
  },
});
