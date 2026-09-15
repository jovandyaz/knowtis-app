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
  await expect(
    dialog.getByRole('button', { name: '¿Dónde ocurre?', exact: true })
  ).toBeVisible();

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

  // Reuse the actor's SPA session instead of spending another IP-scoped refresh request.
  if (page.url() === 'about:blank') {
    await page.goto('/notes');
  } else {
    await page.getByRole('link', { name: 'My Notes', exact: true }).click();
  }
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
    dialog.getByRole('heading', { name: 'Quiz results', exact: true })
  ).toBeVisible();
  await expect(
    dialog.getByText('Accuracy: 50%', { exact: true })
  ).toBeVisible();
  const missedRow = dialog.getByRole('button', {
    name: 'Question 1: Incorrect',
    exact: true,
  });
  await expect(missedRow).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: 'Question 2: Correct', exact: true })
  ).toBeVisible();
  await missedRow.click();
  await expect(missedRow).toHaveAttribute('aria-expanded', 'true');
  const review = dialog.getByRole('region', {
    name: 'Question 1: Incorrect',
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
    dialog.getByRole('heading', { name: 'Quiz results', exact: true })
  ).toBeVisible();
  await expect(
    dialog.getByText('Missed-question practice', { exact: true })
  ).toBeVisible();
  await expect(
    dialog.getByText('Accuracy: 100%', { exact: true })
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
