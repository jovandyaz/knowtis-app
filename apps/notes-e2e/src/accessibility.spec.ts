import AxeBuilder from '@axe-core/playwright';
import {
  devices,
  expect,
  mergeTests,
  type Page,
  type TestInfo,
} from '@playwright/test';
import { z } from 'zod';

import { E2E } from '../support/environment';
import {
  test as copilotTest,
  openCopilotDock,
} from './fixtures/copilot.fixture';
import { test as studyTest } from './fixtures/study.fixture';

const test = mergeTests(copilotTest, studyTest);

const WCAG_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const BLOCKING_IMPACTS = new Set(['serious', 'critical']);
const DEFAULT_VIEWPORT = devices['Desktop Chrome'].viewport;
const DIALOG_SELECTOR = '[role="dialog"]';
const SCENARIOS = [
  { name: 'mobile', width: 390, height: 844, colorScheme: 'light' },
  { name: 'desktop', width: 1280, height: 800, colorScheme: 'light' },
  { name: 'desktop-dark', width: 1280, height: 800, colorScheme: 'dark' },
] as const;
type Scenario = (typeof SCENARIOS)[number];

async function restore(page: Page) {
  await page.setViewportSize(DEFAULT_VIEWPORT);
  await page.emulateMedia({ colorScheme: null, reducedMotion: null });
}

async function prepare(page: Page, scenario: Scenario) {
  await page.setViewportSize({
    width: scenario.width,
    height: scenario.height,
  });
  await page.emulateMedia({
    colorScheme: scenario.colorScheme,
    reducedMotion: 'reduce',
  });
}

/** Blocks on serious and critical violations; lesser ones are attached to the report. */
async function expectAccessible(
  page: Page,
  scenario: Scenario,
  surface: string,
  info: TestInfo,
  scope?: string
) {
  if (scenario.colorScheme === 'dark') {
    await expect(page.locator('html')).toHaveClass(/\bdark\b/);
  }
  // Colours are only measurable once fades and theme transitions have settled.
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every(
        (animation) =>
          animation.playState !== 'running' ||
          animation.effect?.getComputedTiming().iterations === Infinity
      )
  );
  const builder = new AxeBuilder({ page }).withTags(WCAG_AA_TAGS);
  const { violations } = await (
    scope ? builder.include(scope) : builder
  ).analyze();
  const label = `${scenario.name}-${surface}`;
  await info.attach(`axe-${label}`, {
    body: JSON.stringify(violations, null, 2),
    contentType: 'application/json',
  });
  const blocking = violations
    .filter(({ impact }) => impact && BLOCKING_IMPACTS.has(impact))
    .map(({ id, impact, nodes }) => ({
      id,
      impact,
      targets: nodes.map(({ target }) => target.join(' ')),
    }));
  expect.soft(blocking, label).toEqual([]);
}

for (const scenario of SCENARIOS) {
  test.describe(`accessibility at ${scenario.name}`, () => {
    test.beforeEach(async ({ sharing }) => {
      await prepare(sharing.owner.page, scenario);
    });

    // The actors live for the whole worker, so later specs would inherit this.
    test.afterEach(async ({ sharing }) => {
      await restore(sharing.owner.page);
      await restore(sharing.guest.page);
    });

    test('public auth pages', async ({ browser }, info) => {
      const context = await browser.newContext({ baseURL: E2E.frontend });
      try {
        const page = await context.newPage();
        await prepare(page, scenario);
        for (const path of ['login', 'register', 'forgot-password']) {
          await page.goto(`/${path}`);
          await expect(page.getByRole('button').first()).toBeVisible();
          await expectAccessible(page, scenario, path, info);
        }
      } finally {
        await context.close();
      }
    });

    test('dashboard and note editor', async ({ sharing }, info) => {
      const { owner } = sharing;
      await owner.setLocale('en');
      const note = await owner.createNote('Accessibility');

      await owner.page.goto('/dashboard');
      await expect(
        owner.page.getByRole('link', { name: /Accessibility/ }).first()
      ).toBeVisible();
      await expectAccessible(owner.page, scenario, 'dashboard', info);

      await owner.page.goto(`/notes/${note.id}`);
      await expect(owner.page.getByText('Sharing acceptance')).toBeVisible();
      await expectAccessible(owner.page, scenario, 'note', info);
    });

    test('copilot dock', async ({ sharing }, info) => {
      const { owner } = sharing;
      await owner.setLocale('en');
      const note = await owner.createNote('Accessibility copilot');

      await owner.page.goto(`/notes/${note.id}`);
      await expect(await openCopilotDock(owner.page)).toBeVisible();
      await expectAccessible(owner.page, scenario, 'copilot', info);
    });

    test('share dialog', async ({ sharing }, info) => {
      const { owner } = sharing;
      await owner.setLocale('en');
      const note = await owner.createNote('Accessibility sharing');

      await owner.page.goto(`/notes/${note.id}`);
      await owner.page
        .getByRole('button', { name: 'Share', exact: true })
        .click();
      await expect(
        owner.page.getByRole('list', { name: 'People with access' })
      ).toBeVisible();
      await expectAccessible(
        owner.page,
        scenario,
        'share',
        info,
        DIALOG_SELECTOR
      );
    });

    test('flashcard study', async ({ sharing, study }, info) => {
      const { owner } = sharing;
      await owner.setLocale('en');
      const note = await owner.createNote('Accessibility study');
      await study.seedDeck(note.id, owner.id, [
        { front: 'Front', back: 'Back', difficulty: 'easy' },
      ]);

      await owner.page.goto(`/notes/${note.id}`);
      await owner.page.getByRole('tab', { name: /^Study\b/ }).click();
      await owner.page.getByRole('button', { name: /^Fotosíntesis\b/ }).click();
      await expect(owner.page.getByRole('dialog')).toBeVisible();
      await expectAccessible(
        owner.page,
        scenario,
        'study',
        info,
        DIALOG_SELECTOR
      );
    });

    test('public link', async ({ sharing }, info) => {
      const { owner, guest } = sharing;
      const note = await owner.createNote('Accessibility public link');
      const opened = await owner.update(note.id, {
        generalAccess: 'anyone_with_link',
        generalAccessPermission: 'viewer',
      });
      const token = z.string().min(1).parse(opened.shareToken);

      await prepare(guest.page, scenario);
      await guest.page.goto(`/s/${token}`);
      await expect(guest.page.locator('.tiptap')).toBeVisible();
      await expectAccessible(guest.page, scenario, 'public-link', info);
    });
  });
}
