import { useState } from 'react';

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  MERMAID_VIEW_MODE,
  type MermaidViewMode,
} from '@knowtis/editor-schema';

import { MermaidBlockView } from './MermaidBlockView';

let configuredTheme = '';

const initializeMock = vi.fn((config: { theme: string }) => {
  configuredTheme = config.theme;
});

// emulates mermaid v11: render() deletes any pre-existing element with the target id
const renderMock = vi.fn(async (id: string, source: string) => {
  document.getElementById(id)?.remove();
  return {
    svg: `<svg id="${id}" data-source-hash="${source.length}" data-theme="${configuredTheme}"></svg>`,
  };
});

vi.mock('mermaid', () => ({
  default: { initialize: initializeMock, render: renderMock },
}));

vi.mock('@tiptap/react', () => ({
  NodeViewWrapper: ({
    children,
    className,
  }: {
    children?: React.ReactNode;
    className?: string;
  }) => (
    <div className={className} data-testid="node-view">
      {children}
    </div>
  ),
}));

const CODE = 'flowchart LR\n  A[Start] --> B[End]';
const SETTLE_TIMEOUT_MS = 3000;

function Harness({
  initialViewMode,
  editable = true,
}: {
  initialViewMode: MermaidViewMode;
  editable?: boolean;
}) {
  const [attrs, setAttrs] = useState<{
    code: string;
    viewMode: MermaidViewMode;
  }>({ code: CODE, viewMode: initialViewMode });
  const props = {
    node: { attrs },
    updateAttributes: (patch: Partial<typeof attrs>) =>
      setAttrs((a) => ({ ...a, ...patch })),
    selected: false,
    editor: { isEditable: editable },
  } as unknown as Parameters<typeof MermaidBlockView>[0];
  return <MermaidBlockView {...props} />;
}

const previewArea = () =>
  screen.getByTestId('node-view').querySelector('.mermaid-preview-area svg');

// The view debounces, then awaits a dynamic import() whose resolution is not on
// the timer queue — polling for the result is the only race-free way to observe it.
function findSvg() {
  return waitFor(() => expect(previewArea()).not.toBeNull(), {
    timeout: SETTLE_TIMEOUT_MS,
  });
}

function switchMode(user: ReturnType<typeof userEvent.setup>, key: string) {
  return user.click(screen.getByRole('button', { name: key }));
}

describe('MermaidBlockView', () => {
  beforeEach(() => {
    renderMock.mockClear();
    initializeMock.mockClear();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    cleanup();
    document.documentElement.classList.remove('dark');
  });

  it('renders the diagram svg in split view', async () => {
    render(<Harness initialViewMode={MERMAID_VIEW_MODE.SPLIT} />);

    await findSvg();
  });

  it('keeps the svg when the view mode changes and the code is unchanged', async () => {
    const user = userEvent.setup();
    render(<Harness initialViewMode={MERMAID_VIEW_MODE.SPLIT} />);
    await findSvg();

    await switchMode(user, 'editor.mermaid.modePreview');
    await findSvg();

    await switchMode(user, 'editor.mermaid.modeSplit');
    await findSvg();
  });

  it('never asks mermaid to render into the id of the currently mounted svg', async () => {
    const user = userEvent.setup();
    render(<Harness initialViewMode={MERMAID_VIEW_MODE.SPLIT} />);
    await findSvg();

    const mountedId = previewArea()?.getAttribute('id');
    expect(mountedId).toBeTruthy();

    await switchMode(user, 'editor.mermaid.modePreview');
    await waitFor(
      () => expect(renderMock.mock.calls.length).toBeGreaterThan(1),
      { timeout: SETTLE_TIMEOUT_MS }
    );

    const laterIds = renderMock.mock.calls.slice(1).map(([id]) => id);
    expect(laterIds).not.toContain(mountedId);
  });
  it('draws the diagram with the dark mermaid theme while the app is dark', async () => {
    document.documentElement.classList.add('dark');

    render(<Harness initialViewMode={MERMAID_VIEW_MODE.PREVIEW} />);
    await findSvg();

    expect(previewArea()?.getAttribute('data-theme')).toBe('dark');
  });

  it('redraws the diagram when the app theme flips', async () => {
    render(<Harness initialViewMode={MERMAID_VIEW_MODE.PREVIEW} />);
    await findSvg();
    expect(previewArea()?.getAttribute('data-theme')).toBe('neutral');

    document.documentElement.classList.add('dark');

    await waitFor(
      () => expect(previewArea()?.getAttribute('data-theme')).toBe('dark'),
      { timeout: SETTLE_TIMEOUT_MS }
    );
  });

  it('offers the expand control to readers who cannot edit', async () => {
    render(
      <Harness initialViewMode={MERMAID_VIEW_MODE.SPLIT} editable={false} />
    );
    await findSvg();

    expect(
      screen.getByRole('button', { name: 'editor.mermaid.expand' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'editor.mermaid.modeCode' })
    ).toBeNull();
  });

  it('opens the diagram viewer on a double click over the preview', async () => {
    const user = userEvent.setup();
    render(<Harness initialViewMode={MERMAID_VIEW_MODE.PREVIEW} />);
    await findSvg();

    const preview = previewArea()?.parentElement as HTMLElement;
    await user.dblClick(preview);

    expect(screen.queryByRole('dialog')).not.toBeNull();
  });

  it('opens the diagram viewer from the expand control', async () => {
    const user = userEvent.setup();
    render(<Harness initialViewMode={MERMAID_VIEW_MODE.PREVIEW} />);
    await findSvg();

    await user.click(
      screen.getByRole('button', { name: 'editor.mermaid.expand' })
    );

    expect(
      screen.getByRole('dialog').querySelector('svg[data-source-hash]')
    ).not.toBeNull();
  });
});
