export const ADMIN_SECTIONS = [
  {
    to: '/users',
    label: 'Users',
    description: 'Search accounts and manage roles.',
  },
  {
    to: '/ai-metrics',
    label: 'AI Metrics',
    description: 'Track token usage and cost across actions.',
  },
  {
    to: '/feature-flags',
    label: 'Feature Flags',
    description: 'Toggle platform features live.',
  },
] as const;
