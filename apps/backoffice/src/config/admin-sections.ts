import type { AppRoute } from '@/config/routes.config';
import { ROUTES } from '@/config/routes.config';

interface AdminSection {
  to: AppRoute;
  label: string;
  description: string;
}

export const ADMIN_SECTIONS = [
  {
    to: ROUTES.USERS,
    label: 'Users',
    description: 'Search accounts and manage roles.',
  },
  {
    to: ROUTES.AI_METRICS,
    label: 'AI Metrics',
    description: 'Track token usage and cost across actions.',
  },
  {
    to: ROUTES.AI_CONFIG,
    label: 'AI Config',
    description: 'Change the default and fast models live.',
  },
  {
    to: ROUTES.FEATURE_FLAGS,
    label: 'Feature Flags',
    description: 'Toggle product features live.',
  },
  {
    to: ROUTES.AUDIT,
    label: 'Audit Log',
    description: 'Review admin actions.',
  },
] as const satisfies readonly AdminSection[];
