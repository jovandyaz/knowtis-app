import { createFileRoute } from '@tanstack/react-router';

import { AuditPage } from '@/pages/AuditPage';

export const Route = createFileRoute('/_authenticated/audit')({
  component: AuditPage,
});
