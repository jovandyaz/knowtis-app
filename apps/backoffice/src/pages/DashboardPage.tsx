import { Link } from '@tanstack/react-router';

import { ADMIN_SECTIONS } from '@/config/admin-sections';

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@knowtis/design-system';

export function DashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Overview</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ADMIN_SECTIONS.map((section) => (
          <Link key={section.to} to={section.to}>
            <Card className="h-full transition-colors hover:bg-(--muted)">
              <CardHeader>
                <CardTitle>{section.label}</CardTitle>
                <CardDescription>{section.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
