import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as DataAccessAdmin from '@knowtis/data-access-admin';

import { FlagGroupSection } from '../FlagGroupSection';

const { upsertMutate } = vi.hoisted(() => ({ upsertMutate: vi.fn() }));

vi.mock('@knowtis/data-access-admin', async (importOriginal) => {
  const actual = await importOriginal<typeof DataAccessAdmin>();
  return {
    ...actual,
    useUpsertFeatureFlag: vi
      .fn()
      .mockReturnValue({ mutate: upsertMutate, isPending: false }),
  };
});

const WEB_SEARCH_FLAG = {
  key: 'agent_web_search',
  enabled: true,
  description: 'Tavily-backed web search',
  updatedAt: '2026-07-01T00:00:00.000Z',
};

describe('FlagGroupSection', () => {
  beforeEach(() => {
    upsertMutate.mockReset();
  });

  it('renders the catalog label, key, and requires-env chip', () => {
    render(<FlagGroupSection title="Capabilities" flags={[WEB_SEARCH_FLAG]} />);

    expect(
      screen.getByRole('heading', { name: 'Capabilities' })
    ).toBeInTheDocument();
    expect(screen.getByText('Web search')).toBeInTheDocument();
    expect(screen.getByText('agent_web_search')).toBeInTheDocument();
    expect(screen.getByText('requires TAVILY_API_KEY')).toBeInTheDocument();
  });

  it('toggles a flag through the upsert mutation', async () => {
    render(<FlagGroupSection title="Capabilities" flags={[WEB_SEARCH_FLAG]} />);

    await userEvent.click(
      screen.getByRole('switch', { name: 'agent_web_search' })
    );

    expect(upsertMutate).toHaveBeenCalledWith({
      key: 'agent_web_search',
      enabled: false,
      description: 'Tavily-backed web search',
    });
  });

  it('renders nothing for an empty group', () => {
    const { container } = render(<FlagGroupSection title="Empty" flags={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
