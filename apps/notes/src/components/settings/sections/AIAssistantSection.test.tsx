import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AIAssistantSection } from './AIAssistantSection';

const update = vi.fn();
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));
vi.mock('@/hooks', () => ({
  useAvailableModels: () => ({
    data: [
      {
        id: 'a:bal',
        label: 'Balanced One',
        descriptionKey: 'aiModels.sonnet4',
        tier: 'balanced',
        contextWindow: 1000000,
        costClass: 2,
        isDefault: true,
      },
      {
        id: 'a:fast',
        label: 'Fast One',
        descriptionKey: 'aiModels.haiku45',
        tier: 'fast',
        contextWindow: 200000,
        costClass: 1,
        isDefault: false,
      },
    ],
  }),
  useAISettings: () => ({ data: { preferredModel: 'a:bal' } }),
  useUpdateAISettings: () => ({ mutate: update }),
}));

describe('AIAssistantSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates the default model on select', async () => {
    render(<AIAssistantSection />);
    await userEvent.click(screen.getByRole('button', { name: /Balanced One/ }));
    await userEvent.click(screen.getByText('Fast One'));
    expect(update).toHaveBeenCalledWith({ preferredModel: 'a:fast' });
  });
});
