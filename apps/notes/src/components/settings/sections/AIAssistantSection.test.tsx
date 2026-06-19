import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AIAssistantSection } from './AIAssistantSection';

const update = vi.fn();
const useFeatureFlag = vi.fn().mockReturnValue(false);
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));
vi.mock('@knowtis/data-access-feature-flags', () => ({
  useFeatureFlag: () => useFeatureFlag(),
}));
vi.mock('./AIKeysManager', () => ({
  AIKeysManager: () => <div>byok-keys-manager</div>,
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
    useFeatureFlag.mockReturnValue(false);
  });

  it('updates the default model on select', async () => {
    render(<AIAssistantSection />);
    await userEvent.click(screen.getByRole('button', { name: /Balanced One/ }));
    await userEvent.click(screen.getByText('Fast One'));
    expect(update).toHaveBeenCalledWith({ preferredModel: 'a:fast' });
  });

  it('does not render the BYOK keys manager when the flag is off', () => {
    render(<AIAssistantSection />);
    expect(screen.queryByText('byok-keys-manager')).not.toBeInTheDocument();
  });

  it('renders the BYOK keys manager when the flag is enabled', () => {
    useFeatureFlag.mockReturnValue(true);
    render(<AIAssistantSection />);
    expect(screen.getByText('byok-keys-manager')).toBeInTheDocument();
  });
});
