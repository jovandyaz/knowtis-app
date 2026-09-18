import { createRef } from 'react';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ResizablePanel } from './ResizablePanel';

const PANEL_DEFAULT_WIDTH = 320;
const PANEL_MIN_WIDTH = 240;
const PANEL_MAX_WIDTH = 640;
const PANEL_COLLAPSE_THRESHOLD = 160;
const PANEL_KEYBOARD_STEP = 8;

describe('ResizablePanel', () => {
  it('forwards a ref to the rendered element', () => {
    const ref = createRef<HTMLElement>();
    render(
      <ResizablePanel
        ref={ref}
        defaultWidth={PANEL_DEFAULT_WIDTH}
        maxWidth={PANEL_MAX_WIDTH}
        collapseThreshold={PANEL_COLLAPSE_THRESHOLD}
        isOpen
        onCollapse={vi.fn()}
        side="left"
      >
        <p>Panel body</p>
      </ResizablePanel>
    );
    expect(ref.current).toBe(screen.getByText('Panel body').closest('aside'));
  });

  it('animates to targetWidth and back to the previous width', async () => {
    const base = {
      defaultWidth: PANEL_DEFAULT_WIDTH,
      collapseThreshold: PANEL_COLLAPSE_THRESHOLD,
      isOpen: true,
      onCollapse: vi.fn(),
      side: 'right' as const,
    };
    const { rerender } = render(
      <ResizablePanel {...base} maxWidth={PANEL_MAX_WIDTH}>
        <p>Body</p>
      </ResizablePanel>
    );
    const aside = screen.getByText('Body').closest('aside') as HTMLElement;
    expect(aside.style.width).toBe(`${PANEL_DEFAULT_WIDTH}px`);

    rerender(
      <ResizablePanel {...base} maxWidth={900} targetWidth={700}>
        <p>Body</p>
      </ResizablePanel>
    );
    await waitFor(() => expect(aside.style.width).toBe('700px'));
    expect(screen.getByRole('separator')).toHaveAttribute(
      'aria-valuemax',
      '900'
    );

    rerender(
      <ResizablePanel {...base} maxWidth={PANEL_MAX_WIDTH}>
        <p>Body</p>
      </ResizablePanel>
    );
    await waitFor(() =>
      expect(aside.style.width).toBe(`${PANEL_DEFAULT_WIDTH}px`)
    );
  });

  it('caps targetWidth at maxWidth', async () => {
    const base = {
      defaultWidth: PANEL_DEFAULT_WIDTH,
      collapseThreshold: PANEL_COLLAPSE_THRESHOLD,
      isOpen: true,
      onCollapse: vi.fn(),
      side: 'right' as const,
    };
    render(
      <ResizablePanel {...base} maxWidth={600} targetWidth={900}>
        <p>Body</p>
      </ResizablePanel>
    );
    const aside = screen.getByText('Body').closest('aside') as HTMLElement;

    await waitFor(() => expect(aside.style.width).toBe('600px'));
  });

  it('restores the pre-target width when a target-clear happens during a drag', async () => {
    const base = {
      defaultWidth: PANEL_DEFAULT_WIDTH,
      collapseThreshold: PANEL_COLLAPSE_THRESHOLD,
      isOpen: true,
      onCollapse: vi.fn(),
      side: 'right' as const,
    };
    const { rerender } = render(
      <ResizablePanel {...base} maxWidth={900} targetWidth={700}>
        <p>Body</p>
      </ResizablePanel>
    );
    const aside = screen.getByText('Body').closest('aside') as HTMLElement;
    await waitFor(() => expect(aside.style.width).toBe('700px'));

    const separator = screen.getByRole('separator');
    fireEvent.mouseDown(separator, { clientX: 0 });

    rerender(
      <ResizablePanel {...base} maxWidth={900}>
        <p>Body</p>
      </ResizablePanel>
    );

    fireEvent.mouseMove(document, { clientX: 10 });
    fireEvent.mouseUp(document);

    await waitFor(() =>
      expect(aside.style.width).toBe(`${PANEL_DEFAULT_WIDTH}px`)
    );
  });

  it('does not let a drag that ends while a target is active corrupt the user width', async () => {
    const base = {
      defaultWidth: PANEL_DEFAULT_WIDTH,
      collapseThreshold: PANEL_COLLAPSE_THRESHOLD,
      onCollapse: vi.fn(),
      side: 'right' as const,
    };
    const { rerender } = render(
      <ResizablePanel {...base} isOpen maxWidth={900} targetWidth={700}>
        <p>Body</p>
      </ResizablePanel>
    );
    const aside = screen.getByText('Body').closest('aside') as HTMLElement;
    await waitFor(() => expect(aside.style.width).toBe('700px'));

    const separator = screen.getByRole('separator');
    fireEvent.mouseDown(separator, { clientX: 0 });

    rerender(
      <ResizablePanel {...base} isOpen maxWidth={900}>
        <p>Body</p>
      </ResizablePanel>
    );

    fireEvent.mouseMove(document, { clientX: 10 });
    fireEvent.mouseUp(document);
    await waitFor(() =>
      expect(aside.style.width).toBe(`${PANEL_DEFAULT_WIDTH}px`)
    );

    rerender(
      <ResizablePanel {...base} isOpen={false} maxWidth={900}>
        <p>Body</p>
      </ResizablePanel>
    );
    await waitFor(() => expect(aside.style.width).toBe('0px'));

    rerender(
      <ResizablePanel {...base} isOpen maxWidth={900}>
        <p>Body</p>
      </ResizablePanel>
    );
    await waitFor(() =>
      expect(aside.style.width).toBe(`${PANEL_DEFAULT_WIDTH}px`)
    );
  });

  it('restores to a sane width, not 0, when a target set while closed is later cleared', async () => {
    const base = {
      defaultWidth: PANEL_DEFAULT_WIDTH,
      collapseThreshold: PANEL_COLLAPSE_THRESHOLD,
      onCollapse: vi.fn(),
      side: 'right' as const,
    };
    const { rerender } = render(
      <ResizablePanel {...base} isOpen={false} maxWidth={900}>
        <p>Body</p>
      </ResizablePanel>
    );
    expect(screen.queryByText('Body')).not.toBeInTheDocument();

    rerender(
      <ResizablePanel {...base} isOpen={false} maxWidth={900} targetWidth={700}>
        <p>Body</p>
      </ResizablePanel>
    );

    rerender(
      <ResizablePanel {...base} isOpen maxWidth={900} targetWidth={700}>
        <p>Body</p>
      </ResizablePanel>
    );
    const aside = (await screen.findByText('Body')).closest(
      'aside'
    ) as HTMLElement;
    await waitFor(() => expect(aside.style.width).toBe('700px'));

    rerender(
      <ResizablePanel {...base} isOpen maxWidth={900}>
        <p>Body</p>
      </ResizablePanel>
    );
    await waitFor(() =>
      expect(aside.style.width).toBe(`${PANEL_DEFAULT_WIDTH}px`)
    );
  });

  it('exposes the resize bounds on the handle', () => {
    render(
      <ResizablePanel
        defaultWidth={PANEL_DEFAULT_WIDTH}
        minWidth={PANEL_MIN_WIDTH}
        maxWidth={PANEL_MAX_WIDTH}
        collapseThreshold={PANEL_COLLAPSE_THRESHOLD}
        isOpen
        onCollapse={vi.fn()}
        side="left"
      >
        <p>Body</p>
      </ResizablePanel>
    );

    const separator = screen.getByRole('separator');
    expect(separator).toHaveAttribute('aria-valuemin', '0');
    expect(separator).toHaveAttribute('aria-valuemax', `${PANEL_MAX_WIDTH}`);
    expect(separator).toHaveAttribute(
      'aria-valuenow',
      `${PANEL_DEFAULT_WIDTH}`
    );
  });

  it('collapses from the keyboard and reopens at the width the user confirmed', async () => {
    const onCollapse = vi.fn();
    const base = {
      defaultWidth: PANEL_DEFAULT_WIDTH,
      minWidth: PANEL_MIN_WIDTH,
      maxWidth: PANEL_MAX_WIDTH,
      collapseThreshold: PANEL_COLLAPSE_THRESHOLD,
      onCollapse,
      side: 'left' as const,
    };
    const { rerender } = render(
      <ResizablePanel {...base} isOpen>
        <p>Body</p>
      </ResizablePanel>
    );
    const separator = screen.getByRole('separator');
    separator.focus();

    fireEvent.keyDown(separator, { key: 'ArrowRight' });
    fireEvent.keyDown(separator, { key: 'Enter' });

    await waitFor(() => expect(onCollapse).toHaveBeenCalledTimes(1));

    rerender(
      <ResizablePanel {...base} isOpen={false}>
        <p>Body</p>
      </ResizablePanel>
    );
    await waitFor(() =>
      expect(screen.queryByText('Body')).not.toBeInTheDocument()
    );

    rerender(
      <ResizablePanel {...base} isOpen>
        <p>Body</p>
      </ResizablePanel>
    );
    const reopened = (await screen.findByText('Body')).closest(
      'aside'
    ) as HTMLElement;
    await waitFor(() =>
      expect(reopened.style.width).toBe(
        `${PANEL_DEFAULT_WIDTH + PANEL_KEYBOARD_STEP}px`
      )
    );
  });

  it('reports the width the user settles on from the keyboard', () => {
    const onResizeEnd = vi.fn();
    render(
      <ResizablePanel
        defaultWidth={PANEL_DEFAULT_WIDTH}
        minWidth={PANEL_MIN_WIDTH}
        maxWidth={PANEL_MAX_WIDTH}
        collapseThreshold={PANEL_COLLAPSE_THRESHOLD}
        isOpen
        onCollapse={vi.fn()}
        onResizeEnd={onResizeEnd}
        side="left"
      >
        <p>Body</p>
      </ResizablePanel>
    );

    fireEvent.keyDown(screen.getByRole('separator'), { key: 'ArrowRight' });

    const widened = PANEL_DEFAULT_WIDTH + PANEL_KEYBOARD_STEP;
    expect(onResizeEnd).toHaveBeenCalledExactlyOnceWith(widened);
    const aside = screen.getByText('Body').closest('aside') as HTMLElement;
    expect(aside.style.width).toBe(`${widened}px`);
  });
});
