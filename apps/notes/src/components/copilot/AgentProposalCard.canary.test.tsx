import i18n from '@/lib/i18n';
import type { PendingProposal } from '@/stores/agent.store';
import {
  DRAW_TIME_MERMAID,
  HOSTILE_HTML,
  HOSTILE_LINKS_HTML,
  HOSTILE_MERMAID,
  hostileHtmlDocument,
  isBenignText,
  STORED_IMAGE_ALT,
} from '@/test/hostile-markdown';
import { plainClickOutcome } from '@/test/link-navigation';
import { renderWithDiagram, stubMermaidLayout } from '@/test/mermaid-diagram';
import {
  foreignLoads,
  recordResourceLoads,
  resourceLoadsIn,
} from '@/test/resource-loads';
import { render, screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { AgentProposalCard } from './AgentProposalCard';

function createProposal(payload: string): PendingProposal {
  return {
    id: 'p1',
    kind: 'create',
    targetNoteId: null,
    payload: { title: 'Trip', contentHtml: hostileHtmlDocument(payload) },
  };
}

async function renderCard(payload: string): Promise<HTMLElement> {
  render(
    <AgentProposalCard
      proposal={createProposal(payload)}
      onApprove={vi.fn()}
      onReject={vi.fn()}
    />
  );
  await screen.findByText(isBenignText);
  await screen.findByRole('img', { name: STORED_IMAGE_ALT });
  return screen.getByTestId('proposal-preview');
}

describe('AgentProposalCard under a compromised model', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('en');
  });

  it.each(HOSTILE_HTML.map(({ name, source }) => [name, source]))(
    'loads nothing for %s and still previews the rest',
    async (_, source) => {
      const loads = await recordResourceLoads(async () => {
        await renderCard(source);
      });

      expect(foreignLoads(loads)).toEqual([]);
    }
  );

  it.each(HOSTILE_LINKS_HTML.map(({ name, source }) => [name, source]))(
    'navigates nowhere on a plain click of %s',
    async (_, source) => {
      const preview = await renderCard(source);

      const outcome = plainClickOutcome(preview);

      expect(outcome.navigations).toEqual([]);
      expect(outcome.clicked).toBeGreaterThan(0);
    }
  );

  describe('a mermaid diagram', () => {
    let restoreLayout: () => void;

    beforeAll(() => {
      restoreLayout = stubMermaidLayout();
    });

    afterAll(() => {
      restoreLayout();
    });

    it.each(HOSTILE_MERMAID.map(({ name, source }) => [name, source]))(
      'is drawn with %s and loads nothing, not even while drawing',
      async (_, source) => {
        const loads = await recordResourceLoads(async () => {
          await renderWithDiagram(renderCard, source);
        });

        expect(foreignLoads(loads)).toEqual([]);
      }
    );

    it.each(DRAW_TIME_MERMAID.map(({ name, source }) => [name, source]))(
      'is drawn with %s and keeps no load in the drawing it shows',
      async (_, source) => {
        const preview = await renderWithDiagram(renderCard, source);

        expect(foreignLoads(resourceLoadsIn(preview))).toEqual([]);
      }
    );

    it('navigates nowhere on a plain click of a node linked with click href', async () => {
      const clickHref = HOSTILE_MERMAID.find(({ name }) =>
        name.includes('click href')
      );
      const preview = await renderWithDiagram(
        renderCard,
        clickHref?.source ?? ''
      );

      const outcome = plainClickOutcome(preview);

      expect(outcome.navigations).toEqual([]);
      expect(outcome.clicked).toBeGreaterThan(1);
    });
  });
});
