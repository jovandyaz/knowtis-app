import { createRef } from 'react';

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DocumentSkeleton } from './DocumentSkeleton';

const CHILDREN_WITH_TITLE_BAR = 3;
const CHILDREN_WITHOUT_TITLE_BAR = 2;
const HIDDEN_BLOCKS_WITH_TITLE_BAR = 2;

const region = () => screen.getByRole('status');
const regionChildren = () => [...region().children];
const bodyLines = () => [...(region().lastElementChild?.children ?? [])];
const titleBar = () =>
  regionChildren().length === CHILDREN_WITH_TITLE_BAR
    ? regionChildren()[1]
    : null;

describe('DocumentSkeleton', () => {
  it('announces itself with the given label', () => {
    render(<DocumentSkeleton label="Loading note" />);
    expect(
      screen.getByRole('status', { name: 'Loading note' })
    ).toBeInTheDocument();
  });

  it('carries the label as visually hidden content, not as an aria-label', () => {
    render(<DocumentSkeleton label="Loading note" />);
    expect(screen.getByText('Loading note')).toHaveClass('sr-only');
    expect(region()).not.toHaveAttribute('aria-label');
  });

  it('renders six line bars by default', () => {
    render(<DocumentSkeleton label="Loading note" />);
    expect(bodyLines()).toHaveLength(6);
  });

  it('renders the requested number of line bars', () => {
    render(<DocumentSkeleton label="Loading note" lines={9} />);
    expect(bodyLines()).toHaveLength(9);
  });

  it('renders a title bar by default', () => {
    render(<DocumentSkeleton label="Loading note" />);
    expect(titleBar()).not.toBeNull();
  });

  it('drops the title bar when showTitle is false', () => {
    render(<DocumentSkeleton label="Loading note" showTitle={false} />);
    expect(regionChildren()).toHaveLength(CHILDREN_WITHOUT_TITLE_BAR);
    expect(titleBar()).toBeNull();
  });

  it('hides every bar from assistive technology', () => {
    render(<DocumentSkeleton label="Loading note" lines={3} />);
    const bars = regionChildren().filter(
      (child) => child !== screen.getByText('Loading note')
    );
    expect(bars).toHaveLength(HIDDEN_BLOCKS_WITH_TITLE_BAR);
    expect(
      bars.every((bar) => bar.getAttribute('aria-hidden') === 'true')
    ).toBe(true);
  });

  it('forwards a ref to the rendered element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<DocumentSkeleton ref={ref} label="Loading note" />);
    expect(ref.current).toBe(region());
  });
});
