import { createRef } from 'react';

import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BUCKET_FILTERS } from '@knowtis/shared-types';

import { BucketDot, type BucketDotTone } from './BucketDot';

const DOT_CLASS_BY_TONE: Record<BucketDotTone, string> = {
  neutral: 'bg-(--muted-foreground)',
  inbox: 'border-dashed',
  projects: 'bg-bucket-projects',
  areas: 'bg-bucket-areas',
  resources: 'bg-bucket-resources',
  archive: 'border-bucket-archive',
};

const TONES: readonly BucketDotTone[] = ['neutral', ...BUCKET_FILTERS];

describe('BucketDot', () => {
  it.each(TONES)('paints the %s dot with its own tone', (tone) => {
    const { container } = render(<BucketDot bucket={tone} />);
    expect(container.firstElementChild).toHaveClass(DOT_CLASS_BY_TONE[tone]);
  });

  it('stays out of the accessibility tree', () => {
    const { container } = render(<BucketDot bucket="projects" />);
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });

  it('lets a consumer override the default size', () => {
    const { container } = render(
      <BucketDot bucket="areas" className="size-1.5" />
    );
    const dot = container.firstElementChild;
    expect(dot).toHaveClass('size-1.5');
    expect(dot).not.toHaveClass('size-[9px]');
  });

  it('forwards a ref and rest props to the rendered span', () => {
    const ref = createRef<HTMLSpanElement>();
    const { container } = render(
      <BucketDot ref={ref} bucket="archive" data-tone="archive" />
    );
    expect(ref.current).toBe(container.firstElementChild);
    expect(ref.current).toHaveAttribute('data-tone', 'archive');
  });
});
