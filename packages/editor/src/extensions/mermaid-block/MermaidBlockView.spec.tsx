import { useState } from 'react';

import { act, render, screen } from '@testing-library/react';
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

async function settleRender() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(400);
  });
}

describe('MermaidBlockView', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    renderMock.mockClear();
    document.body.innerHTML = '';
  });

  it('renders the diagram svg in split view', async () => {
    render(<Harness initialViewMode={MERMAID_VIEW_MODE.SPLIT} />);
    await settleRender();

    const view = screen.getByTestId('node-view');
    expect(view.querySelector('.mermaid-preview-area svg')).not.toBeNull();
  });

  it('keeps the svg when the view mode changes and the code is unchanged', async () => {
    render(<Harness initialViewMode={MERMAID_VIEW_MODE.SPLIT} />);
    await settleRender();

    const view = screen.getByTestId('node-view');
    expect(view.querySelector('.mermaid-preview-area svg')).not.toBeNull();

    const previewButton = screen.getByRole('button', {
      name: 'editor.mermaid.modePreview',
    });
    await act(async () => {
      previewButton.click();
    });
    await settleRender();

    expect(view.querySelector('.mermaid-preview-area svg')).not.toBeNull();

    const splitButton = screen.getByRole('button', {
      name: 'editor.mermaid.modeSplit',
    });
    await act(async () => {
      splitButton.click();
    });
    await settleRender();

    expect(view.querySelector('.mermaid-preview-area svg')).not.toBeNull();
  });

  it('never asks mermaid to render into the id of the currently mounted svg', async () => {
    render(<Harness initialViewMode={MERMAID_VIEW_MODE.SPLIT} />);
    await settleRender();

    expect(renderMock).toHaveBeenCalled();
    const mountedId = screen
      .getByTestId('node-view')
      .querySelector('.mermaid-preview-area svg')
      ?.getAttribute('id');
    expect(mountedId).toBeTruthy();

    const previewButton = screen.getByRole('button', {
      name: 'editor.mermaid.modePreview',
    });
    await act(async () => {
      previewButton.click();
    });
    await settleRender();

    const laterIds = renderMock.mock.calls.slice(1).map(([id]) => id);
    expect(laterIds).not.toContain(mountedId);
  });
});
