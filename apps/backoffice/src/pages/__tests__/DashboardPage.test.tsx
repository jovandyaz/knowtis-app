import { ADMIN_SECTIONS } from '@/config/admin-sections';
import { renderWithRouter } from '@/test/router';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DashboardPage } from '../DashboardPage';

const LINKED_PATHS = ADMIN_SECTIONS.map((section) => section.to);

describe('DashboardPage', () => {
  it('links to every admin section', async () => {
    await renderWithRouter(DashboardPage, LINKED_PATHS);

    expect(
      screen.getByRole('heading', { name: /overview/i })
    ).toBeInTheDocument();

    const hrefs = screen
      .getAllByRole('link')
      .map((link) => link.getAttribute('href'));
    expect(hrefs).toEqual(expect.arrayContaining([...LINKED_PATHS]));

    for (const section of ADMIN_SECTIONS) {
      expect(
        screen.getByRole('heading', { name: section.label })
      ).toBeInTheDocument();
    }
  });
});
