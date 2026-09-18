import { expect } from '@playwright/test';

import { test } from './fixtures/study.fixture';

test('studies a deck in focus mode with the keyboard and returns to the note', async ({
  sharing,
  study,
}) => {
  const { owner } = sharing;
  const { page } = owner;
  await owner.setLocale('en');
  await page.setViewportSize({ width: 1280, height: 800 });
  const note = await owner.createNote('Fotosíntesis');
  const deckId = await study.seedDeck(note.id, owner.id, [
    {
      front: '¿Qué absorbe la clorofila?',
      back: 'Luz roja y azul.',
      difficulty: 'easy',
    },
    {
      front: '¿Dónde ocurre?',
      back: 'En los cloroplastos.',
      difficulty: 'medium',
    },
  ]);

  await page.goto(`/notes/${note.id}`);
  await page.getByRole('tab', { name: /^Study\b/ }).click();
  await page.getByRole('button', { name: /^Fotosíntesis\b/ }).click();

  const dialog = page.getByRole('dialog', {
    name: 'Flashcards: Fotosíntesis',
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === `/notes/${note.id}` &&
      url.searchParams.get('study') === deckId
  );
  await expect(
    dialog.getByRole('button', {
      name: '¿Qué absorbe la clorofila?',
      exact: true,
    })
  ).toBeVisible();

  await page.keyboard.press('Space');
  await expect(
    dialog.getByRole('button', { name: 'Luz roja y azul.', exact: true })
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(
    dialog.getByText('Luz roja y azul.', { exact: true })
  ).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: 'Next', exact: true })
  ).toBeVisible();
  await page.keyboard.press('2');
  await expect(
    dialog.getByRole('progressbar', { name: '1 of 2 answered', exact: true })
  ).toBeVisible();
  const secondCard = dialog.getByRole('button', {
    name: '¿Dónde ocurre?',
    exact: true,
  });
  await expect(secondCard).toBeVisible();
  await expect(secondCard).toBeFocused();

  await page.keyboard.press('Escape');
  const confirmation = page.getByRole('dialog', {
    name: 'Leave this study session?',
    exact: true,
  });
  await expect(confirmation).toBeVisible();
  await confirmation
    .getByRole('button', { name: 'Keep studying', exact: true })
    .click();
  await expect(confirmation).toHaveCount(0);
  await expect(dialog).toBeVisible();

  await page.goBack();
  await expect(confirmation).toBeVisible();
  await confirmation
    .getByRole('button', { name: 'Keep studying', exact: true })
    .click();
  await expect(confirmation).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === `/notes/${note.id}` &&
      url.searchParams.get('study') === deckId
  );
  await expect(secondCard).toBeFocused();

  await page.keyboard.press('Space');
  await expect(
    dialog.getByRole('button', { name: 'En los cloroplastos.', exact: true })
  ).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('1');
  await expect(
    dialog.getByRole('heading', { name: '1 / 2 recalled', exact: true })
  ).toBeVisible();
  await dialog
    .getByRole('button', { name: 'Back to note', exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === `/notes/${note.id}` && !url.searchParams.has('study')
  );
  await expect(
    page.getByRole('heading', { name: 'Study Tools', exact: true })
  ).toBeVisible();
});

test('answers a quiz, reviews the result and retries the missed question', async ({
  sharing,
  study,
}) => {
  const { owner } = sharing;
  const { page } = owner;
  await owner.setLocale('en');
  await page.setViewportSize({ width: 1280, height: 800 });
  const note = await owner.createNote('Quiz');
  const quizId = await study.seedQuiz(note.id, owner.id, [
    {
      question: '¿Pigmento?',
      options: ['Clorofila', 'Hemoglobina'],
      correctIndex: 0,
      explanation: 'La clorofila capta la luz.',
    },
    {
      question: '¿Orgánulo?',
      options: ['Cloroplasto', 'Mitocondria'],
      correctIndex: 0,
      explanation: 'La fotosíntesis ocurre en los cloroplastos.',
    },
  ]);

  await page.goto(`/notes/${note.id}`);
  await page.getByRole('link', { name: 'All notes', exact: true }).click();
  await page.getByRole('searchbox').fill('Quiz');
  await page
    .getByRole('main')
    .getByRole('link', { name: /^Quiz\b/ })
    .click();
  await expect(page).toHaveURL((url) => url.pathname === `/notes/${note.id}`);
  await page.getByRole('tab', { name: /^Study\b/ }).click();
  await page.getByRole('button', { name: /^Quiz de fotosíntesis\b/ }).click();
  const dialog = page.getByRole('dialog', {
    name: 'Quiz: Quiz de fotosíntesis',
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === `/notes/${note.id}` &&
      url.searchParams.get('study') === quizId
  );
  await expect(
    dialog.getByRole('radiogroup', { name: '¿Pigmento?', exact: true })
  ).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: 'Check answer', exact: true })
  ).toBeDisabled();

  await page.keyboard.press('2');
  await expect(
    dialog.getByRole('radio', { name: /Hemoglobina/ })
  ).toHaveAttribute('aria-checked', 'true');
  await expect(
    dialog.getByRole('button', { name: 'Check answer', exact: true })
  ).toBeEnabled();
  await page.keyboard.press('Enter');
  await expect(dialog.getByRole('status')).toHaveText(
    'Incorrect. Correct answer: A. Clorofila'
  );
  await expect(
    dialog.getByRole('button', { name: 'Next question', exact: true })
  ).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(
    dialog.getByRole('radiogroup', { name: '¿Orgánulo?', exact: true })
  ).toBeVisible();
  await page.keyboard.press('1');
  await expect(
    dialog.getByRole('radio', { name: /Cloroplasto/ })
  ).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Enter');
  await expect(dialog.getByRole('status')).toHaveText(
    'Correct. A. Cloroplasto'
  );
  await expect(
    dialog.getByRole('button', { name: 'View results', exact: true })
  ).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(
    dialog.getByRole('heading', { name: '1 / 2 correct', exact: true })
  ).toBeVisible();
  const hero = dialog.getByRole('progressbar', {
    name: '1 / 2 correct',
    exact: true,
  });
  await expect(hero).toHaveAccessibleName('1 / 2 correct');
  await expect(hero).toHaveAttribute('aria-valuenow', '2');
  await expect(hero).toHaveAttribute('aria-valuemax', '2');
  const missedRow = dialog.getByRole('button', {
    name: 'Q1 ¿Pigmento?',
    exact: true,
  });
  await expect(missedRow).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: 'Q2 ¿Orgánulo?', exact: true })
  ).toHaveCount(0);
  await missedRow.click();
  await expect(missedRow).toHaveAttribute('aria-expanded', 'true');
  const review = dialog.getByRole('region', {
    name: 'Q1 ¿Pigmento?',
    exact: true,
  });
  await expect(
    review.getByText('B. Hemoglobina', { exact: true })
  ).toBeVisible();
  await expect(review.getByText('A. Clorofila', { exact: true })).toBeVisible();
  await expect(
    review.getByText('La clorofila capta la luz.', { exact: true })
  ).toBeVisible();

  await dialog
    .getByRole('button', { name: 'Retry missed (1)', exact: true })
    .click();
  await expect(
    dialog.getByText('Question 1 of 1', { exact: true })
  ).toBeVisible();
  await expect(
    dialog.getByRole('radiogroup', { name: '¿Pigmento?', exact: true })
  ).toBeVisible();
  await page.keyboard.press('1');
  await expect(
    dialog.getByRole('radio', { name: /Clorofila/ })
  ).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Enter');
  await expect(dialog.getByRole('status')).toHaveText('Correct. A. Clorofila');
  await expect(
    dialog.getByRole('button', { name: 'View results', exact: true })
  ).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(
    dialog.getByRole('heading', { name: '1 / 1 correct', exact: true })
  ).toBeVisible();
  await expect(
    dialog.getByText('Missed-question practice', { exact: true })
  ).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: 'Practice again', exact: true })
  ).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: 'Retry missed (1)', exact: true })
  ).toHaveCount(0);
  await dialog
    .getByRole('button', { name: 'Back to note', exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === `/notes/${note.id}` && !url.searchParams.has('study')
  );
});

for (const locale of ['en', 'es'] as const) {
  test(`study design ${locale}`, async ({ sharing, study }, testInfo) => {
    const owner = locale === 'en' ? sharing.owner : sharing.editor;
    const { page } = owner;
    const copy =
      locale === 'en'
        ? {
            skip: 'Skip card',
            prev: 'Previous',
            correct: 'Recalled',
            wrong: 'Not recalled',
            back: 'Back to note',
            options: 'Practice options',
            all: 'All cards',
            quizCheck: 'Check answer',
            quizNext: 'Next question',
            quizFinish: 'View results',
          }
        : {
            skip: 'Omitir tarjeta',
            prev: 'Anterior',
            correct: 'Lo recordé',
            wrong: 'No lo recordé',
            back: 'Volver a la nota',
            options: 'Opciones de práctica',
            all: 'Todas las tarjetas',
            quizCheck: 'Comprobar respuesta',
            quizNext: 'Siguiente pregunta',
            quizFinish: 'Ver resultados',
          };
    const errors: string[] = [];
    const onPageError = (error: Error) => errors.push(error.message);
    page.on('pageerror', onPageError);

    try {
      await owner.setLocale(locale);
      const note = await owner.createNote('Photosynthesis layout');
      await study.seedDeck(note.id, owner.id, [
        {
          front: 'Where does photosynthesis occur?',
          back: 'In chloroplasts.',
          difficulty: 'easy',
        },
        {
          front: 'Where do light-dependent reactions occur?',
          back: 'In the thylakoid membranes.',
          difficulty: 'medium',
        },
        {
          front: 'What pigment captures light?',
          back: 'Chlorophyll.',
          difficulty: 'hard',
        },
      ]);
      await study.seedQuiz(note.id, owner.id, [
        {
          question: 'Which pigment captures light?',
          options: ['Chlorophyll', 'Haemoglobin'],
          correctIndex: 0,
          explanation: 'Chlorophyll absorbs light.',
        },
        {
          question: 'Which organelle contains thylakoids?',
          options: ['Chloroplast', 'Nucleus'],
          correctIndex: 0,
          explanation: '',
        },
      ]);
      await page.goto(`/notes/${note.id}`);

      const copilotToggle = page.getByRole('button', {
        name: 'Copilot',
        exact: true,
      });
      if ((await copilotToggle.getAttribute('aria-pressed')) === 'true') {
        await copilotToggle.click();
      }

      for (const width of [1440, 390]) {
        for (const theme of ['light', 'dark'] as const) {
          for (const reducedMotion of ['no-preference', 'reduce'] as const) {
            const combo = `${width}-${theme}-${reducedMotion}-${locale}`;
            await test.step(combo, async () => {
              await page.setViewportSize({ width, height: 900 });
              await page.emulateMedia({ colorScheme: theme, reducedMotion });
              await page.evaluate((value) => {
                document.documentElement.classList.toggle(
                  'dark',
                  value === 'dark'
                );
              }, theme);
              await page
                .getByRole('tab', {
                  name: locale === 'en' ? /^Study\b/ : /^Estudio\b/,
                })
                .click();
              await page
                .getByRole('button', { name: /^Fotosíntesis\b/ })
                .click();
              const dialog = page.getByRole('dialog', {
                name: 'Flashcards: Fotosíntesis',
                exact: true,
              });
              await expect(dialog).toBeVisible();
              const shot = async (state: string, surface = dialog) => {
                await surface.evaluate(async (node) => {
                  await document.fonts.ready;
                  await new Promise<void>((resolve) =>
                    requestAnimationFrame(() => resolve())
                  );
                  await Promise.allSettled(
                    node
                      .getAnimations({ subtree: true })
                      .filter(
                        (animation) =>
                          animation.effect?.getTiming().iterations !== Infinity
                      )
                      .map((animation) => animation.finished)
                  );
                });
                await expect(surface).toHaveJSProperty(
                  'scrollWidth',
                  await surface.evaluate((node) => node.clientWidth)
                );
                await testInfo.attach(`${combo}-${state}-accessibility`, {
                  body: await surface.ariaSnapshot(),
                  contentType: 'text/plain',
                });
                await page.screenshot({
                  path: testInfo.outputPath(`${combo}-${state}.png`),
                  fullPage: true,
                });
              };
              await shot('card-front');
              await dialog
                .getByRole('button', {
                  name: 'Where does photosynthesis occur?',
                  exact: true,
                })
                .click();
              await shot('card-back');
              await dialog
                .getByRole('button', { name: copy.correct, exact: true })
                .click();
              await expect(
                dialog.getByRole('button', {
                  name: 'Where do light-dependent reactions occur?',
                  exact: true,
                })
              ).toBeFocused();
              await dialog
                .getByRole('button', { name: copy.prev, exact: true })
                .click();
              await dialog
                .getByRole('button', {
                  name: 'Where does photosynthesis occur?',
                  exact: true,
                })
                .click();
              await shot('card-revisited');
              const continueLabel =
                locale === 'en' ? 'Continue studying' : 'Continuar estudiando';
              await dialog
                .getByRole('button', { name: continueLabel, exact: true })
                .click();
              await dialog
                .getByRole('button', {
                  name: 'Where do light-dependent reactions occur?',
                  exact: true,
                })
                .click();
              await dialog
                .getByRole('button', { name: copy.wrong, exact: true })
                .click();
              await expect(
                dialog.getByRole('button', {
                  name: 'What pigment captures light?',
                  exact: true,
                })
              ).toBeFocused();
              const footer = dialog.locator('footer');
              const controls = footer.getByRole('button');
              await expect(controls).toHaveCount(3);
              const boxes = await controls.evaluateAll((nodes) =>
                nodes.map((node) => {
                  const box = node.getBoundingClientRect();
                  return { y: box.y, width: box.width, height: box.height };
                })
              );
              expect(
                Math.max(...boxes.map((box) => box.y)) -
                  Math.min(...boxes.map((box) => box.y))
              ).toBeLessThanOrEqual(1);
              expect(
                boxes.every((box) => box.width >= 44 && box.height >= 44)
              ).toBe(true);
              await dialog
                .getByRole('button', { name: copy.skip, exact: true })
                .click();
              const mixedHeadline =
                locale === 'en' ? '1 / 3 recalled' : '1 / 3 recordadas';
              await expect(
                dialog.getByRole('heading', {
                  name: mixedHeadline,
                  exact: true,
                })
              ).toBeFocused();
              await shot('summary-misses');
              await dialog
                .getByRole('button', { name: copy.options, exact: true })
                .click();
              await page
                .getByRole('menuitem', { name: copy.all, exact: true })
                .click();
              for (const prompt of [
                'Where does photosynthesis occur?',
                'Where do light-dependent reactions occur?',
                'What pigment captures light?',
              ]) {
                const card = dialog.getByRole('button', {
                  name: prompt,
                  exact: true,
                });
                await expect(card).toBeVisible();
                await card.click();
                await dialog
                  .getByRole('button', { name: copy.correct, exact: true })
                  .click();
                await expect(card).toHaveCount(0);
              }
              const perfectHeadline =
                locale === 'en' ? '3 / 3 recalled' : '3 / 3 recordadas';
              await expect(
                dialog.getByRole('heading', {
                  name: perfectHeadline,
                  exact: true,
                })
              ).toBeFocused();
              await shot('summary-perfect');
              await dialog
                .getByRole('button', { name: copy.back, exact: true })
                .click();
              await page
                .getByRole('tab', {
                  name: locale === 'en' ? /^Study\b/ : /^Estudio\b/,
                })
                .click();
              await page
                .getByRole('button', { name: /^Quiz de fotosíntesis\b/ })
                .click();
              const quizDialog = page.getByRole('dialog', {
                name: 'Quiz: Quiz de fotosíntesis',
                exact: true,
              });
              await expect(quizDialog).toBeVisible();
              await shot('quiz-question', quizDialog);
              await quizDialog
                .getByRole('radio', { name: /Haemoglobin/ })
                .click();
              await quizDialog
                .getByRole('button', { name: copy.quizCheck, exact: true })
                .click();
              await expect(
                quizDialog.getByRole('radio', { name: /Haemoglobin/ })
              ).toHaveAttribute('data-state', 'incorrect');
              await shot('quiz-checked', quizDialog);
              await quizDialog
                .getByRole('button', { name: copy.quizNext, exact: true })
                .click();
              await quizDialog
                .getByRole('radio', { name: /Chloroplast/ })
                .click();
              await quizDialog
                .getByRole('button', { name: copy.quizCheck, exact: true })
                .click();
              await quizDialog
                .getByRole('button', { name: copy.quizFinish, exact: true })
                .click();
              const quizHeadline =
                locale === 'en' ? '1 / 2 correct' : '1 / 2 correctas';
              await expect(
                quizDialog.getByRole('heading', {
                  name: quizHeadline,
                  exact: true,
                })
              ).toBeFocused();
              await expect(quizDialog).toHaveJSProperty(
                'scrollWidth',
                await quizDialog.evaluate((node) => node.clientWidth)
              );
              await shot('quiz-results', quizDialog);
              await quizDialog
                .getByRole('button', { name: copy.options, exact: true })
                .click();
              await page
                .getByRole('menuitem', {
                  name:
                    locale === 'en' ? 'Practice again' : 'Practicar de nuevo',
                  exact: true,
                })
                .click();
              await expect(
                quizDialog.getByRole('radiogroup', {
                  name: 'Which pigment captures light?',
                  exact: true,
                })
              ).toBeVisible();
              await page.keyboard.press('Escape');
              await expect(quizDialog).toHaveCount(0);
              expect(errors).toEqual([]);
            });
          }
        }
      }
    } finally {
      page.off('pageerror', onPageError);
    }
  });
}
