import { renderWithRouter } from '@/test/router';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DashboardPage } from '../DashboardPage';

describe('DashboardPage', () => {
  it('links to the three admin sections', async () => {
    await renderWithRouter(DashboardPage, [
      '/users',
      '/ai-metrics',
      '/feature-flags',
    ]);

    expect(
      screen.getByRole('heading', { name: /overview/i })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /users/i })).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /ai metrics/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /feature flags/i })
    ).toBeInTheDocument();
  });
});
