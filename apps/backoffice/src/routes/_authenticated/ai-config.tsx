import { createFileRoute } from '@tanstack/react-router';

import { AiConfigPage } from '@/pages/AiConfigPage';

export const Route = createFileRoute('/_authenticated/ai-config')({
  component: AiConfigPage,
});
