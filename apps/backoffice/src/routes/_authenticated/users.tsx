import { createFileRoute } from '@tanstack/react-router';

import { UsersPage } from '@/pages/UsersPage';

export const Route = createFileRoute('/_authenticated/users')({
  component: UsersPage,
});
