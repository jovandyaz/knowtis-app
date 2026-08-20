import { useState } from 'react';

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  MERMAID_VIEW_MODE,
  type MermaidViewMode,
} from '@knowtis/editor-schema';

import { MermaidBlockView } from './MermaidBlockView';

// emulates mermaid v11: render() deletes any pre-existing element with the target id
const renderMock = vi.fn(async (id: string, source: string) => {
  document.getElementById(id)?.remove();
  return { svg: `<svg id="${id}" data-source-hash="${source.length}"></svg>` };
});

vi.mock('mermaid', () => ({
  default: { initialize: vi.fn(), render: renderMock },
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

function Harness({ initialViewMode }: { initialViewMode: MermaidViewMode }) {
  const [attrs, setAttrs] = useState<{
    code: string;
    viewMode: MermaidViewMode;
  }>({ code: CODE, viewMode: initialViewMode });
  const props = {
    node: { attrs },
    updateAttributes: (patch: Partial<typeof attrs>) =>
      setAttrs((a) => ({ ...a, ...patch })),
    selected: false,
    editor: { isEditable: true },
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
    document.body.innerHTML = '';
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
});
