import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LanguageSection } from './LanguageSection';

const changeLanguage = vi.fn();
const mutate = vi.fn();
const setUser = vi.fn();
const language = vi.fn<() => string>();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string) => k,
    i18n: { language: language(), changeLanguage },
  }),
}));
vi.mock('@jovandyaz/auth-react', () => ({
  useAuthUser: () => ({ id: 'u1', locale: 'en' }),
  useAuthStore: () => (selector: (s: { setUser: typeof setUser }) => unknown) =>
    selector({ setUser }),
}));
vi.mock('@knowtis/data-access-users', () => ({
  useUpdateProfile: () => ({ mutate }),
}));

describe('LanguageSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    language.mockReturnValue('en');
  });

  it('exposes the language choice as a radio group with the active state', () => {
    render(<LanguageSection />);

    expect(screen.getByRole('radiogroup')).toBeInTheDocument();
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(2);
    expect(screen.getByRole('radio', { name: 'language.en' })).toBeChecked();
    expect(
      screen.getByRole('radio', { name: 'language.es' })
    ).not.toBeChecked();
  });

  it('marks a regional variant as its base language', () => {
    language.mockReturnValue('es-MX');
    render(<LanguageSection />);

    expect(screen.getByRole('radio', { name: 'language.es' })).toBeChecked();
  });

  it('switches the language and persists it on selection', async () => {
    render(<LanguageSection />);

    await userEvent.click(screen.getByRole('radio', { name: 'language.es' }));

    expect(changeLanguage).toHaveBeenCalledWith('es');
    expect(mutate).toHaveBeenCalledWith(
      { locale: 'es' },
      expect.objectContaining({ onError: expect.any(Function) })
    );
  });
});
