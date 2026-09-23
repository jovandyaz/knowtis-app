import { refuseStorage } from '@/test/refuse-storage';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useDockPreferenceStore } from './dock-preference.store';

const STORAGE_KEY = 'notes-dock';

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

describe('useDockPreferenceStore', () => {
  beforeEach(() => {
    useDockPreferenceStore.setState({ preferredWidth: 360 });
    localStorage.clear();
  });

  it('starts at the default preferred width', () => {
    expect(useDockPreferenceStore.getInitialState().preferredWidth).toBe(500);
  });

  it('records the width the user settles on', () => {
    useDockPreferenceStore.getState().setPreferredWidth(440);

    expect(useDockPreferenceStore.getState().preferredWidth).toBe(440);
  });

  it('persists only the preferred width under the notes-dock key', () => {
    useDockPreferenceStore.getState().setPreferredWidth(440);

    expect(storedState()).toEqual({ preferredWidth: 440 });
  });

  it('restores an in-range persisted width', async () => {
    seedPersistedWidth('440');

    await useDockPreferenceStore.persist.rehydrate();

    expect(useDockPreferenceStore.getState().preferredWidth).toBe(440);
  });

  it('hydrates the persisted width when the store is created', async () => {
    seedPersistedWidth('420');
    vi.resetModules();

    const { useDockPreferenceStore: freshStore } =
      await import('./dock-preference.store');

    expect(freshStore.getState().preferredWidth).toBe(420);
  });

  it.each([
    { label: 'the minimum', raw: '300' },
    { label: 'the maximum', raw: '720' },
  ])('restores a persisted width at $label', async ({ raw }) => {
    seedPersistedWidth(raw);

    await useDockPreferenceStore.persist.rehydrate();

    expect(useDockPreferenceStore.getState().preferredWidth).toBe(Number(raw));
  });

  it.each([
    { label: 'a non-finite width', raw: '1e999' },
    { label: 'a string width', raw: '"420"' },
    { label: 'a width below the minimum', raw: '299' },
    { label: 'a review width above the maximum', raw: '961' },
  ])('falls back to the default width for $label', async ({ raw }) => {
    seedPersistedWidth(raw);

    await useDockPreferenceStore.persist.rehydrate();

    expect(useDockPreferenceStore.getState().preferredWidth).toBe(500);
  });

  it.each([
    { label: 'the minimum', width: 300, expected: 300 },
    { label: 'the maximum', width: 720, expected: 720 },
    { label: 'below the minimum', width: 100, expected: 300 },
    { label: 'above the maximum', width: 1000, expected: 720 },
  ])('clamps a direct write at $label', ({ width, expected }) => {
    useDockPreferenceStore.getState().setPreferredWidth(width);

    expect(useDockPreferenceStore.getState().preferredWidth).toBe(expected);
  });

  it.each([{ width: NaN }, { width: Infinity }])(
    'ignores a direct write of $width',
    ({ width }) => {
      useDockPreferenceStore.getState().setPreferredWidth(440);

      useDockPreferenceStore.getState().setPreferredWidth(width);

      expect(useDockPreferenceStore.getState().preferredWidth).toBe(440);
    }
  );

  describe('when the browser refuses storage', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('still applies the new width', () => {
      refuseStorage();

      useDockPreferenceStore.getState().setPreferredWidth(440);

      expect(useDockPreferenceStore.getState().preferredWidth).toBe(440);
    });
  });
});
