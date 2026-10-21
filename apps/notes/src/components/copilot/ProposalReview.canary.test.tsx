import i18n from '@/lib/i18n';
import type { UpdateProposal } from '@/stores/agent.store';
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
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { ProposalReview } from './ProposalReview';
import { useProposalBefore, type ProposalBefore } from './useProposalBefore';

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }));
vi.mock('./useProposalBefore', () => ({ useProposalBefore: vi.fn() }));

const BEFORE: ProposalBefore = {
  status: 'ready',
  isLive: true,
  title: 'Trip',
  contentHtml: '<p>Old plan</p>',
};

const PREVIEWS = [
  ['the diff', BEFORE, 'review-diff'],
  ['the fallback preview', { status: 'error' }, 'review-fallback'],
] as const satisfies readonly (readonly [string, ProposalBefore, string])[];

function updateProposal(payload: string): UpdateProposal {
  return {
    id: 'p1',
    kind: 'update',
    targetNoteId: 'n1',
    payload: { contentHtml: hostileHtmlDocument(payload) },
  };
}

describe.each(PREVIEWS)(
  'ProposalReview under a compromised model: %s',
  (_, before, testId) => {
    async function renderPreview(payload: string): Promise<HTMLElement> {
      render(
        <ProposalReview
          proposal={updateProposal(payload)}
          onApprove={vi.fn()}
          onReject={vi.fn()}
          onBack={vi.fn()}
        />
      );
      await screen.findByText(isBenignText);
      await screen.findByRole('img', { name: STORED_IMAGE_ALT });
      return screen.getByTestId(testId);
    }

    beforeAll(async () => {
      await i18n.changeLanguage('en');
    });

    beforeEach(() => {
      Element.prototype.scrollIntoView = vi.fn();
      vi.mocked(useProposalBefore).mockReturnValue(before);
    });

    it.each(HOSTILE_HTML.map(({ name, source }) => [name, source]))(
      'loads nothing for %s and still shows the rest',
      async (_, source) => {
        const loads = await recordResourceLoads(async () => {
          await renderPreview(source);
        });

        expect(foreignLoads(loads)).toEqual([]);
      }
    );

    it.each(HOSTILE_LINKS_HTML.map(({ name, source }) => [name, source]))(
      'navigates nowhere on a plain click of %s',
      async (_, source) => {
        const preview = await renderPreview(source);

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
            await renderWithDiagram(renderPreview, source);
          });

          expect(foreignLoads(loads)).toEqual([]);
        }
      );

      it.each(DRAW_TIME_MERMAID.map(({ name, source }) => [name, source]))(
        'is drawn with %s and keeps no load in the drawing it shows',
        async (_, source) => {
          const preview = await renderWithDiagram(renderPreview, source);

          expect(foreignLoads(resourceLoadsIn(preview))).toEqual([]);
        }
      );
    });
  }
);
