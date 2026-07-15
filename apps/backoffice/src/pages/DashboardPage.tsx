import { Link } from '@tanstack/react-router';

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@knowtis/design-system';

const SECTION_LINKS = [
  {
    to: '/users',
    title: 'Users',
    description: 'Search accounts and manage roles.',
  },
  {
    to: '/ai-metrics',
    title: 'AI Metrics',
    description: 'Track token usage and cost across actions.',
  },
  {
    to: '/feature-flags',
    title: 'Feature Flags',
    description: 'Toggle platform features live.',
  },
] as const;

export function DashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Overview</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SECTION_LINKS.map((section) => (
          <Link key={section.to} to={section.to}>
            <Card className="h-full transition-colors hover:bg-(--muted)">
              <CardHeader>
                <CardTitle>{section.title}</CardTitle>
                <CardDescription>{section.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
