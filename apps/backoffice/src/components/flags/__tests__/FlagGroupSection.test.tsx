import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { httpClient } from '@knowtis/api-client';
import { FEATURE_FLAG_KEYS, type FeatureFlagDto } from '@knowtis/shared-types';

import { FlagGroupSection } from '../FlagGroupSection';

vi.mock('@knowtis/api-client', () => ({
  httpClient: {
    get: vi.fn(),
    patch: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
  aiModelsApi: { getModels: vi.fn() },
}));

const FLAG_TIMESTAMP = '2026-07-01T00:00:00.000Z';

const WEB_SEARCH_FLAG: FeatureFlagDto = {
  key: FEATURE_FLAG_KEYS.AGENT_WEB_SEARCH,
  enabled: true,
  description: 'Tavily-backed web search',
  updatedAt: FLAG_TIMESTAMP,
};

const HYBRID_RETRIEVAL_FLAG: FeatureFlagDto = {
  key: FEATURE_FLAG_KEYS.AGENT_HYBRID_RETRIEVAL,
  enabled: false,
  description: 'Voyage-backed reranking',
  updatedAt: FLAG_TIMESTAMP,
};

const BYOK_FLAG: FeatureFlagDto = {
  key: FEATURE_FLAG_KEYS.AGENT_BYOK,
  enabled: false,
  description: null,
  updatedAt: FLAG_TIMESTAMP,
};

const ADHOC_FLAG: FeatureFlagDto = {
  key: 'some_adhoc_flag',
  enabled: false,
  description: null,
  updatedAt: FLAG_TIMESTAMP,
};

function upsertResponse(flag: FeatureFlagDto) {
  return {
    key: flag.key,
    enabled: !flag.enabled,
    description: flag.description,
    createdAt: FLAG_TIMESTAMP,
    updatedAt: FLAG_TIMESTAMP,
  };
}

function deferredResponse() {
  let settle!: (value: unknown) => void;
  const promise = new Promise<unknown>((resolve) => {
    settle = resolve;
  });
  return { promise, resolve: settle };
}

function renderSection(title: string, flags: FeatureFlagDto[]) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={client}>
      <FlagGroupSection title={title} flags={flags} />
    </QueryClientProvider>
  );
}

describe('FlagGroupSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the catalog label, key, and requires-env chip', () => {
    renderSection('Capabilities', [WEB_SEARCH_FLAG]);

    expect(
      screen.getByRole('heading', { name: 'Capabilities' })
    ).toBeInTheDocument();
    expect(screen.getByText('Web search')).toBeInTheDocument();
    expect(screen.getByText(WEB_SEARCH_FLAG.key)).toBeInTheDocument();
    expect(screen.getByText('requires TAVILY_API_KEY')).toBeInTheDocument();
  });

  it('toggles a flag through the upsert mutation', async () => {
    vi.mocked(httpClient.put).mockResolvedValue(
      upsertResponse(WEB_SEARCH_FLAG)
    );

    renderSection('Capabilities', [WEB_SEARCH_FLAG]);

    await userEvent.click(screen.getByRole('switch', { name: 'Web search' }));

    await waitFor(() =>
      expect(httpClient.put).toHaveBeenCalledWith(
        `/flags/${WEB_SEARCH_FLAG.key}`,
        { enabled: false, description: 'Tavily-backed web search' }
      )
    );
  });

  it('omits description from the payload when the flag has none', async () => {
    vi.mocked(httpClient.put).mockResolvedValue(upsertResponse(BYOK_FLAG));

    renderSection('Access', [BYOK_FLAG]);

    await userEvent.click(
      screen.getByRole('switch', { name: 'Bring your own key' })
    );

    await waitFor(() =>
      expect(httpClient.put).toHaveBeenCalledWith(`/flags/${BYOK_FLAG.key}`, {
        enabled: true,
      })
    );
  });

  it('disables only the row whose write is in flight', async () => {
    const webSearchPut = deferredResponse();
    vi.mocked(httpClient.put).mockReturnValueOnce(webSearchPut.promise);

    renderSection('Capabilities', [WEB_SEARCH_FLAG, HYBRID_RETRIEVAL_FLAG]);
    const webSearch = screen.getByRole('switch', { name: 'Web search' });
    const hybridRetrieval = screen.getByRole('switch', {
      name: 'Hybrid retrieval',
    });

    await userEvent.click(webSearch);

    await waitFor(() => expect(webSearch).toBeDisabled());
    expect(hybridRetrieval).toBeEnabled();

    webSearchPut.resolve(upsertResponse(WEB_SEARCH_FLAG));
    await waitFor(() => expect(webSearch).toBeEnabled());
  });

  it('keeps a row disabled while a later row starts its own write', async () => {
    const webSearchPut = deferredResponse();
    const hybridRetrievalPut = deferredResponse();
    vi.mocked(httpClient.put)
      .mockReturnValueOnce(webSearchPut.promise)
      .mockReturnValueOnce(hybridRetrievalPut.promise);

    renderSection('Capabilities', [WEB_SEARCH_FLAG, HYBRID_RETRIEVAL_FLAG]);
    const webSearch = screen.getByRole('switch', { name: 'Web search' });
    const hybridRetrieval = screen.getByRole('switch', {
      name: 'Hybrid retrieval',
    });

    await userEvent.click(webSearch);
    await waitFor(() => expect(webSearch).toBeDisabled());

    await userEvent.click(hybridRetrieval);
    await waitFor(() => expect(hybridRetrieval).toBeDisabled());
    expect(webSearch).toBeDisabled();

    webSearchPut.resolve(upsertResponse(WEB_SEARCH_FLAG));
    hybridRetrievalPut.resolve(upsertResponse(HYBRID_RETRIEVAL_FLAG));

    await waitFor(() => {
      expect(webSearch).toBeEnabled();
      expect(hybridRetrieval).toBeEnabled();
    });
  });

  it('prints an uncatalogued key once, as its own label', () => {
    renderSection('Other', [WEB_SEARCH_FLAG, ADHOC_FLAG]);

    expect(screen.getAllByText(ADHOC_FLAG.key)).toHaveLength(1);
    expect(
      screen.getByRole('switch', { name: ADHOC_FLAG.key })
    ).toBeInTheDocument();
  });

  it('renders nothing for an empty group', () => {
    renderSection('Empty', []);

    expect(
      screen.queryByRole('heading', { name: 'Empty' })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('switch')).toHaveLength(0);
  });
});
