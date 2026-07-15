import { createFileRoute } from '@tanstack/react-router';

import { AiMetricsPage } from '@/pages/AiMetricsPage';

export const Route = createFileRoute('/_authenticated/ai-metrics')({
  component: AiMetricsPage,
});
