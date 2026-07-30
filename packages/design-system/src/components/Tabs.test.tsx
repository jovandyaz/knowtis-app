import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Tabs, TabsContent, TabsList, TabsTrigger } from './Tabs';

function renderTabs() {
  return render(
    <Tabs defaultValue="one">
      <TabsList>
        <TabsTrigger value="one">One</TabsTrigger>
        <TabsTrigger value="two">Two</TabsTrigger>
      </TabsList>
      <TabsContent value="one">First panel</TabsContent>
      <TabsContent value="two">Second panel</TabsContent>
    </Tabs>
  );
}

describe('Tabs', () => {
  it('shows only the active tab content', () => {
    renderTabs();
    expect(screen.getByRole('tabpanel', { name: 'One' })).toHaveTextContent(
      'First panel'
    );
    expect(
      screen.queryByRole('tabpanel', { name: 'Two' })
    ).not.toBeInTheDocument();
  });

  it('switches content when another tab is clicked', async () => {
    renderTabs();
    await userEvent.click(screen.getByRole('tab', { name: 'Two' }));
    expect(screen.getByRole('tabpanel', { name: 'Two' })).toHaveTextContent(
      'Second panel'
    );
    expect(
      screen.queryByRole('tabpanel', { name: 'One' })
    ).not.toBeInTheDocument();
  });

  it('marks the active trigger as selected for assistive tech', () => {
    renderTabs();
    expect(screen.getByRole('tab', { name: 'One' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  it('moves selection to the next tab with ArrowRight', async () => {
    const user = userEvent.setup();
    renderTabs();
    await user.click(screen.getByRole('tab', { name: 'One' }));
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Two' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });
});

function stubScrollMetrics(
  element: HTMLElement,
  metrics: { scrollWidth: number; clientWidth: number; scrollLeft: number }
) {
  Object.defineProperty(element, 'scrollWidth', {
    configurable: true,
    value: metrics.scrollWidth,
  });
  Object.defineProperty(element, 'clientWidth', {
    configurable: true,
    value: metrics.clientWidth,
  });
  Object.defineProperty(element, 'scrollLeft', {
    configurable: true,
    writable: true,
    value: metrics.scrollLeft,
  });
}

describe('TabsList overflow affordance', () => {
  it('reports no overflow when the triggers fit', () => {
    renderTabs();
    const list = screen.getByRole('tablist');
    stubScrollMetrics(list, {
      scrollWidth: 300,
      clientWidth: 300,
      scrollLeft: 0,
    });
    fireEvent.scroll(list);
    expect(list).toHaveAttribute('data-overflow', 'none');
  });

  it('reports end overflow when scrolled to the start', () => {
    renderTabs();
    const list = screen.getByRole('tablist');
    stubScrollMetrics(list, {
      scrollWidth: 500,
      clientWidth: 300,
      scrollLeft: 0,
    });
    fireEvent.scroll(list);
    expect(list).toHaveAttribute('data-overflow', 'end');
  });

  it('reports start overflow when scrolled to the far end', () => {
    renderTabs();
    const list = screen.getByRole('tablist');
    stubScrollMetrics(list, {
      scrollWidth: 500,
      clientWidth: 300,
      scrollLeft: 200,
    });
    fireEvent.scroll(list);
    expect(list).toHaveAttribute('data-overflow', 'start');
  });

  it('reports overflow on both sides mid-scroll', () => {
    renderTabs();
    const list = screen.getByRole('tablist');
    stubScrollMetrics(list, {
      scrollWidth: 500,
      clientWidth: 300,
      scrollLeft: 100,
    });
    fireEvent.scroll(list);
    expect(list).toHaveAttribute('data-overflow', 'both');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('recomputes when the element is resized', () => {
    const observers: Array<() => void> = [];
    class FakeResizeObserver {
      constructor(callback: () => void) {
        observers.push(callback);
      }
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);

    renderTabs();
    const list = screen.getByRole('tablist');
    stubScrollMetrics(list, {
      scrollWidth: 500,
      clientWidth: 300,
      scrollLeft: 0,
    });
    act(() => {
      observers.forEach((notify) => {
        notify();
      });
    });
    expect(list).toHaveAttribute('data-overflow', 'end');
  });

  it('still forwards the ref to the list element', () => {
    const ref = { current: null as HTMLElement | null };
    render(
      <Tabs defaultValue="one">
        <TabsList ref={ref}>
          <TabsTrigger value="one">One</TabsTrigger>
        </TabsList>
        <TabsContent value="one">First panel</TabsContent>
      </Tabs>
    );
    expect(ref.current).toBe(screen.getByRole('tablist'));
  });
});
