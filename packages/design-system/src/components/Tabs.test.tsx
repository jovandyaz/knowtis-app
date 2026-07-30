import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { triggerResizeObservers } from '../test-setup';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './Tabs';
import {
  TABS_FOCUS_MASK_RESET_CLASS,
  TABS_OVERFLOW,
  TABS_OVERFLOW_MASK_CLASS,
  type TabsOverflow,
} from './tabs-overflow';

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

interface ScrollMetrics {
  scrollWidth: number;
  clientWidth: number;
  scrollLeft: number;
}

const FITTING: ScrollMetrics = {
  scrollWidth: 300,
  clientWidth: 300,
  scrollLeft: 0,
};
const OVERFLOWING_AT_START: ScrollMetrics = {
  scrollWidth: 500,
  clientWidth: 300,
  scrollLeft: 0,
};

function stubScrollMetrics(element: HTMLElement, metrics: ScrollMetrics) {
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

function stubScrollMetricsBeforeRender(metrics: ScrollMetrics) {
  vi.spyOn(Element.prototype, 'scrollWidth', 'get').mockReturnValue(
    metrics.scrollWidth
  );
  vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(
    metrics.clientWidth
  );
  vi.spyOn(Element.prototype, 'scrollLeft', 'get').mockReturnValue(
    metrics.scrollLeft
  );
}

const EDGE_MASK_UTILITY_PATTERN: Record<TabsOverflow, RegExp> = {
  [TABS_OVERFLOW.NONE]: /^$/,
  [TABS_OVERFLOW.LEFT]: /^mask-l-from-\S+$/,
  [TABS_OVERFLOW.RIGHT]: /^mask-r-from-\S+$/,
  [TABS_OVERFLOW.BOTH]: /^mask-x-from-\S+$/,
};

describe('tab strip mask utilities', () => {
  it.each(Object.values(TABS_OVERFLOW))(
    'fades the edge the %s state can still scroll towards',
    (state) => {
      expect(TABS_OVERFLOW_MASK_CLASS[state]).toMatch(
        EDGE_MASK_UTILITY_PATTERN[state]
      );
    }
  );

  it('resets a focused strip with a real mask-none utility', () => {
    expect(TABS_FOCUS_MASK_RESET_CLASS).toMatch(
      /^has-\[:focus-visible\]:mask-none!?$/
    );
  });
});

describe('TabsList overflow affordance', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('clears the overflow state again once the triggers fit', () => {
    renderTabs();
    const list = screen.getByRole('tablist');

    stubScrollMetrics(list, OVERFLOWING_AT_START);
    fireEvent.scroll(list);
    expect(list).toHaveAttribute('data-overflow', 'right');

    stubScrollMetrics(list, FITTING);
    fireEvent.scroll(list);
    expect(list).toHaveAttribute('data-overflow', 'none');
  });

  it('reports right overflow when scrolled to the left edge', () => {
    renderTabs();
    const list = screen.getByRole('tablist');
    stubScrollMetrics(list, OVERFLOWING_AT_START);
    fireEvent.scroll(list);
    expect(list).toHaveAttribute('data-overflow', 'right');
  });

  it('reports left overflow when scrolled to the right edge', () => {
    renderTabs();
    const list = screen.getByRole('tablist');
    stubScrollMetrics(list, {
      scrollWidth: 500,
      clientWidth: 300,
      scrollLeft: 200,
    });
    fireEvent.scroll(list);
    expect(list).toHaveAttribute('data-overflow', 'left');
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

  it('reports overflow already present on first paint', () => {
    stubScrollMetricsBeforeRender(OVERFLOWING_AT_START);
    renderTabs();
    expect(screen.getByRole('tablist')).toHaveAttribute(
      'data-overflow',
      'right'
    );
  });

  it('recomputes when the element is resized', () => {
    renderTabs();
    const list = screen.getByRole('tablist');
    stubScrollMetrics(list, OVERFLOWING_AT_START);
    act(() => {
      triggerResizeObservers();
    });
    expect(list).toHaveAttribute('data-overflow', 'right');
  });

  it('recomputes when the trigger set changes without a resize', async () => {
    const { rerender } = render(
      <Tabs defaultValue="one">
        <TabsList>
          <TabsTrigger value="one">One</TabsTrigger>
        </TabsList>
        <TabsContent value="one">First panel</TabsContent>
      </Tabs>
    );
    const list = screen.getByRole('tablist');
    expect(list).toHaveAttribute('data-overflow', 'none');

    stubScrollMetrics(list, OVERFLOWING_AT_START);
    rerender(
      <Tabs defaultValue="one">
        <TabsList>
          <TabsTrigger value="one">One</TabsTrigger>
          <TabsTrigger value="two">Two</TabsTrigger>
        </TabsList>
        <TabsContent value="one">First panel</TabsContent>
        <TabsContent value="two">Second panel</TabsContent>
      </Tabs>
    );

    await waitFor(() => {
      expect(list).toHaveAttribute('data-overflow', 'right');
    });
  });

  it('applies the edge mask matching the current overflow state', () => {
    renderTabs();
    const list = screen.getByRole('tablist');

    stubScrollMetrics(list, OVERFLOWING_AT_START);
    fireEvent.scroll(list);
    expect(list).toHaveClass(TABS_OVERFLOW_MASK_CLASS.right);
    expect(list).not.toHaveClass(TABS_OVERFLOW_MASK_CLASS.left);

    stubScrollMetrics(list, {
      scrollWidth: 500,
      clientWidth: 300,
      scrollLeft: 100,
    });
    fireEvent.scroll(list);
    expect(list).toHaveClass(TABS_OVERFLOW_MASK_CLASS.both);
    expect(list).not.toHaveClass(TABS_OVERFLOW_MASK_CLASS.right);

    stubScrollMetrics(list, {
      scrollWidth: 500,
      clientWidth: 300,
      scrollLeft: 200,
    });
    fireEvent.scroll(list);
    expect(list).toHaveClass(TABS_OVERFLOW_MASK_CLASS.left);
    expect(list).not.toHaveClass(TABS_OVERFLOW_MASK_CLASS.both);
  });

  it('applies no edge mask while the triggers fit', () => {
    renderTabs();
    const list = screen.getByRole('tablist');
    stubScrollMetrics(list, FITTING);
    fireEvent.scroll(list);

    expect(list).toHaveAttribute('data-overflow', 'none');
    expect(list).not.toHaveClass(TABS_OVERFLOW_MASK_CLASS.left);
    expect(list).not.toHaveClass(TABS_OVERFLOW_MASK_CLASS.right);
    expect(list).not.toHaveClass(TABS_OVERFLOW_MASK_CLASS.both);
  });

  it('drops the mask while a trigger holds visible focus', () => {
    renderTabs();
    expect(screen.getByRole('tablist')).toHaveClass(
      TABS_FOCUS_MASK_RESET_CLASS
    );
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

  it('releases the forwarded ref when the list unmounts', () => {
    const ref = { current: null as HTMLElement | null };
    const { unmount } = render(
      <Tabs defaultValue="one">
        <TabsList ref={ref}>
          <TabsTrigger value="one">One</TabsTrigger>
        </TabsList>
        <TabsContent value="one">First panel</TabsContent>
      </Tabs>
    );
    expect(ref.current).not.toBeNull();

    unmount();

    expect(ref.current).toBeNull();
  });
});
