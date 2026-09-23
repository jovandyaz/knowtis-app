import { refuseStorageWrites } from '@/test/refuse-storage';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSidebarPreferenceStore } from './sidebar-preference.store';

const STORAGE_KEY = 'notes-sidebar';

function seedPersistedWidth(rawJson: string) {
  localStorage.setItem(
    STORAGE_KEY,
    `{"state":{"preferredWidth":${rawJson}},"version":0}`
  );
}

function storedState(): Record<string, unknown> {
  const raw = localStorage.getItem(STORAGE_KEY);
  expect(raw).not.toBeNull();
  const parsed: { state: Record<string, unknown> } = JSON.parse(raw ?? '');
  return parsed.state;
}

describe('useSidebarPreferenceStore', () => {
  beforeEach(() => {
    useSidebarPreferenceStore.setState({ preferredWidth: 272 });
    localStorage.clear();
  });

  it('starts at the default preferred width', () => {
    expect(useSidebarPreferenceStore.getInitialState().preferredWidth).toBe(
      272
    );
  });

  it('records the width the user settles on', () => {
    useSidebarPreferenceStore.getState().setPreferredWidth(320);

    expect(useSidebarPreferenceStore.getState().preferredWidth).toBe(320);
  });

  it('persists only the preferred width under the notes-sidebar key', () => {
    useSidebarPreferenceStore.getState().setPreferredWidth(320);

    expect(storedState()).toEqual({ preferredWidth: 320 });
  });

  it('restores an in-range persisted width', async () => {
    seedPersistedWidth('320');

    await useSidebarPreferenceStore.persist.rehydrate();

    expect(useSidebarPreferenceStore.getState().preferredWidth).toBe(320);
  });

  it('hydrates the persisted width when the store is created', async () => {
    seedPersistedWidth('300');
    vi.resetModules();

    const { useSidebarPreferenceStore: freshStore } =
      await import('./sidebar-preference.store');

    expect(freshStore.getState().preferredWidth).toBe(300);
  });

  it.each([
    { label: 'the minimum', raw: '224' },
    { label: 'the maximum', raw: '360' },
  ])('restores a persisted width at $label', async ({ raw }) => {
    seedPersistedWidth(raw);

    await useSidebarPreferenceStore.persist.rehydrate();

    expect(useSidebarPreferenceStore.getState().preferredWidth).toBe(
      Number(raw)
    );
  });

  it.each([
    { label: 'a non-finite width', raw: '1e999' },
    { label: 'a string width', raw: '"300"' },
    { label: 'a width below the minimum', raw: '100' },
    { label: 'a width above the maximum', raw: '1000' },
  ])('falls back to the default width for $label', async ({ raw }) => {
    seedPersistedWidth(raw);

    await useSidebarPreferenceStore.persist.rehydrate();

    expect(useSidebarPreferenceStore.getState().preferredWidth).toBe(272);
  });

  it.each([
    { label: 'the minimum', width: 224, expected: 224 },
    { label: 'the maximum', width: 360, expected: 360 },
    { label: 'below the minimum', width: 100, expected: 224 },
    { label: 'above the maximum', width: 1000, expected: 360 },
  ])('clamps a direct write at $label', ({ width, expected }) => {
    useSidebarPreferenceStore.getState().setPreferredWidth(width);

    expect(useSidebarPreferenceStore.getState().preferredWidth).toBe(expected);
  });

  it.each([{ width: NaN }, { width: Infinity }])(
    'ignores a direct write of $width',
    ({ width }) => {
      useSidebarPreferenceStore.getState().setPreferredWidth(320);

      useSidebarPreferenceStore.getState().setPreferredWidth(width);

      expect(useSidebarPreferenceStore.getState().preferredWidth).toBe(320);
    }
  );

  describe('when the browser refuses storage', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('still applies the new width', () => {
      refuseStorageWrites();

      useSidebarPreferenceStore.getState().setPreferredWidth(320);

      expect(useSidebarPreferenceStore.getState().preferredWidth).toBe(320);
    });
  });
});
