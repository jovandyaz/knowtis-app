import { lazy, Suspense } from 'react';

import { createFileRoute } from '@tanstack/react-router';

import { ProtectedRoute } from '@/components/auth';
import { Loader2 } from 'lucide-react';

const HomePage = lazy(() =>
  import('@/pages/HomePage').then((m) => ({ default: m.HomePage }))
);

export const Route = createFileRoute('/')({
  component: HomePageWrapper,
});

function HomePageWrapper() {
  return (
    <ProtectedRoute>
      <Suspense fallback={<LoadingFallback />}>
        <HomePage />
      </Suspense>
    </ProtectedRoute>
  );
}

function LoadingFallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-(--primary)" />
    </div>
  );
}
