import i18n from '@/lib/i18n';
import {
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
import { render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';

import { AgentMessage } from './AgentMessage';

function renderAnswer(payload: string, isStreaming: boolean) {
  return render(
    <AgentMessage
      message={{
        id: 'm1',
        role: 'assistant',
        content: hostileMarkdownDocument(payload),
      }}
      isStreaming={isStreaming}
    />
  );
}

const RENDER_MODES = [
  ['a finished', false],
  ['a streaming', true],
] as const;

describe('AgentMessage under a compromised model', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('en');
  });

  describe.each(RENDER_MODES)('%s answer', (_, isStreaming) => {
    it.each(HOSTILE_MARKDOWN.map(({ name, source }) => [name, source]))(
      'loads nothing for %s and still renders the rest',
      async (_, source) => {
        const loads = await recordResourceLoads(async () => {
          renderAnswer(source, isStreaming);
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
        const { container } = renderAnswer(source, isStreaming);
        await screen.findByText(isBenignText);

        const outcome = plainClickOutcome(container);

        expect(outcome.navigations).toEqual([]);
        expect(outcome.clicked).toBeGreaterThan(0);
      }
    );
  });

  it('keeps the text of a link whose scheme it refuses, in an anchor with no URL', async () => {
    renderAnswer('[chat link](irc://canary.invalid/channel)', false);
    await screen.findByText(isBenignText);

    expect(screen.getByText('chat link')).not.toHaveAttribute('href');
    expect(screen.queryByRole('link', { name: 'chat link' })).toBeNull();
  });

  it.each(MERMAID_SOURCES.map(({ name, source }) => [name, source]))(
    'shows a mermaid diagram with %s as code and draws nothing',
    async (_, source) => {
      const loads = await recordResourceLoads(async () => {
        renderAnswer(mermaidFence(source), false);
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
