import { createFileRoute } from '@tanstack/react-router';

import { FeatureFlagsPage } from '@/pages/FeatureFlagsPage';

export const Route = createFileRoute('/_authenticated/feature-flags')({
  component: FeatureFlagsPage,
});
