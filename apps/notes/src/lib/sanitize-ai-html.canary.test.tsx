import { SummaryViewer } from '@/components/artifacts/SummaryViewer';
import { VoiceNoteResult } from '@/components/voice-note/VoiceNoteResult';
import {
  HOSTILE_HTML,
  HOSTILE_LINKS_HTML,
  hostileHtmlDocument,
  isBenignText,
  MERMAID_SOURCES,
  mermaidBlockHtml,
} from '@/test/hostile-markdown';
import { plainClickOutcome } from '@/test/link-navigation';
import { foreignLoads, recordResourceLoads } from '@/test/resource-loads';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function renderSummary(html: string) {
  return render(
    <SummaryViewer
      artifact={{
        id: 'a1',
        userId: 'u1',
        sourceNoteId: 'n1',
        title: 'Key ideas',
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
        type: 'summary',
        content: { summary: html, keyPoints: [] },
      }}
    />
  );
}

function renderVoiceNote(html: string) {
  return render(
    <VoiceNoteResult
      title="Memo"
      content={html}
      onCreateNote={vi.fn()}
      onRetry={vi.fn()}
      onDiscard={vi.fn()}
    />
  );
}

const SURFACES = [
  ['a summary', renderSummary],
  ['a voice-note result', renderVoiceNote],
] as const;

describe.each(SURFACES)('%s under a compromised model', (_, renderSurface) => {
  it.each(HOSTILE_HTML.map(({ name, source }) => [name, source]))(
    'loads nothing for %s and still shows the rest',
    async (_, source) => {
      const loads = await recordResourceLoads(async () => {
        renderSurface(hostileHtmlDocument(source));
        await screen.findByText(isBenignText);
      });

      expect(foreignLoads(loads)).toEqual([]);
    }
  );

  it.each(HOSTILE_LINKS_HTML.map(({ name, source }) => [name, source]))(
    'navigates nowhere on a plain click of %s',
    async (_, source) => {
      const { container } = renderSurface(hostileHtmlDocument(source));
      await screen.findByText(isBenignText);

      const outcome = plainClickOutcome(container);

      expect(outcome.navigations).toEqual([]);
      expect(outcome.clicked).toBeGreaterThan(0);
    }
  );

  it.each(MERMAID_SOURCES.map(({ name, source }) => [name, source]))(
    'keeps a mermaid block with %s inert',
    async (_, source) => {
      const loads = await recordResourceLoads(async () => {
        renderSurface(hostileHtmlDocument(mermaidBlockHtml(source)));
        await screen.findByText(isBenignText);
      });

      expect(foreignLoads(loads)).toEqual([]);
      expect(document.querySelector('svg[id^="mermaid"]')).toBeNull();
    }
  );
});
