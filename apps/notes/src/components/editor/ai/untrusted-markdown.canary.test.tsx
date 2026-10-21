import { useAIStore } from '@/stores/ai.store';
import {
  doneAIBlockHtml,
  HOSTILE_LINKS_MARKDOWN,
  HOSTILE_MARKDOWN,
  hostileMarkdownDocument,
  isBenignText,
  MERMAID_SOURCES,
  mermaidFence,
  STORED_IMAGE_ALT,
} from '@/test/hostile-markdown';
import { plainClickOutcome } from '@/test/link-navigation';
import { foreignLoads, recordResourceLoads } from '@/test/resource-loads';
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ReadOnlyEditor } from '@knowtis/editor';

import { AIStreamingPreview } from './AIStreamingPreview';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function renderPreview(payload: string, status: 'streaming' | 'done') {
  useAIStore.setState({
    status,
    streamedText: hostileMarkdownDocument(payload),
  });
  return render(
    <AIStreamingPreview
      onReplace={vi.fn()}
      onInsertBelow={vi.fn()}
      onDiscard={vi.fn()}
    />
  );
}

function renderAIBlock(payload: string) {
  return render(
    <ReadOnlyEditor
      content={doneAIBlockHtml(hostileMarkdownDocument(payload))}
    />
  );
}

const SURFACES = [
  [
    'the Ask-AI preview while it streams',
    (payload: string) => renderPreview(payload, 'streaming'),
  ],
  [
    'the Ask-AI preview once done',
    (payload: string) => renderPreview(payload, 'done'),
  ],
  ['a finished AI block in a read-only note', renderAIBlock],
] as const;

describe.each(SURFACES)('%s under a compromised model', (_, renderSurface) => {
  afterEach(() => {
    act(() => {
      useAIStore.getState().reset();
    });
  });

  it.each(HOSTILE_MARKDOWN.map(({ name, source }) => [name, source]))(
    'loads nothing for %s and still renders the rest',
    async (_, source) => {
      const loads = await recordResourceLoads(async () => {
        renderSurface(source);
        await screen.findByText(isBenignText);
      });

      expect(foreignLoads(loads)).toEqual([]);
      expect(
        screen.getByRole('img', { name: STORED_IMAGE_ALT })
      ).toBeInTheDocument();
    }
  );

  it.each(HOSTILE_LINKS_MARKDOWN.map(({ name, source }) => [name, source]))(
    'navigates nowhere on a plain click of %s',
    async (_, source) => {
      const { container } = renderSurface(source);
      await screen.findByText(isBenignText);

      const outcome = plainClickOutcome(container);

      expect(outcome.navigations).toEqual([]);
      expect(outcome.clicked).toBeGreaterThan(0);
    }
  );

  it.each(MERMAID_SOURCES.map(({ name, source }) => [name, source]))(
    'shows a mermaid diagram with %s as code and draws nothing',
    async (_, source) => {
      const loads = await recordResourceLoads(async () => {
        renderSurface(mermaidFence(source));
        await screen.findByText(isBenignText);
      });

      expect(foreignLoads(loads)).toEqual([]);
      expect(document.querySelector('svg[id^="mermaid"]')).toBeNull();
      expect(
        document.querySelector('[data-streamdown="code-block"] pre')
      ).toHaveTextContent(source.split('\n')[0] ?? '');
    }
  );
});
