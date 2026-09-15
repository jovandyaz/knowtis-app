import { Route } from '@/routes/_app';
import { useRightDockStore } from '@/stores/right-dock.store';
import type * as AuthReact from '@jovandyaz/auth-react';
import { createEvent, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jovandyaz/auth-react', async (importOriginal) => ({
  ...(await importOriginal<typeof AuthReact>()),
  useAuthLoading: () => true,
  useAuthUser: () => null,
}));

vi.mock('@knowtis/data-access-feature-flags', () => ({
  useFeatureFlag: () => false,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}));

function renderAppLayout() {
  const AppLayout = Route.options.component;
  if (!AppLayout) {
    throw new Error('The app route must render its layout');
  }
  return render(<AppLayout />);
}

describe.each([
  { platform: 'Macintosh', modifier: { metaKey: true }, shortcut: 'Cmd+J' },
  { platform: 'Windows', modifier: { ctrlKey: true }, shortcut: 'Ctrl+J' },
])('AppLayout $shortcut', ({ platform, modifier }) => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(platform);
    useRightDockStore.setState({ isOpen: false });
  });

  afterEach(() => vi.restoreAllMocks());

  it('toggles Copilot without a study overlay', () => {
    renderAppLayout();

    fireEvent.keyDown(document, { key: 'j', ...modifier });
    expect(useRightDockStore.getState().isOpen).toBe(true);

    fireEvent.keyDown(document, { key: 'j', ...modifier });
    expect(useRightDockStore.getState().isOpen).toBe(false);
  });

  it('prevents the shortcut during study and resumes after the overlay closes', () => {
    renderAppLayout();
    const overlay = render(<div data-study-focus="" />);

    const event = createEvent.keyDown(document, { key: 'j', ...modifier });
    fireEvent(document, event);
    expect(event.defaultPrevented).toBe(true);
    expect(useRightDockStore.getState().isOpen).toBe(false);

    overlay.unmount();
    fireEvent.keyDown(document, { key: 'j', ...modifier });
    expect(useRightDockStore.getState().isOpen).toBe(true);
  });

  it('leaves non-matching keys untouched during study', () => {
    renderAppLayout();
    render(<div data-study-focus="" />);

    for (const keys of [{ key: 'j' }, { key: 'x', ...modifier }]) {
      const event = createEvent.keyDown(document, keys);
      fireEvent(document, event);
      expect(event.defaultPrevented).toBe(false);
    }
    expect(useRightDockStore.getState().isOpen).toBe(false);
  });
});
