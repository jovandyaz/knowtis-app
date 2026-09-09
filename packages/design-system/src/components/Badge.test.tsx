import { createRef } from 'react';

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Badge } from './Badge';

describe('Badge', () => {
  it('renders the count variant as a compact numeric pill', () => {
    render(<Badge variant="count">12</Badge>);
    const badge = screen.getByText('12');
    expect(badge.className).toContain('tabular-nums');
    expect(badge.className).toContain('min-w-5');
  });

  it('keeps the default variant unchanged', () => {
    render(<Badge>New</Badge>);
    expect(screen.getByText('New').className).toContain('bg-(--foreground)');
  });

  it('renders phrasing content by default', () => {
    render(<Badge>Inline</Badge>);
    expect(screen.getByText('Inline').tagName).toBe('SPAN');
  });

  it('renders a div when the caller asks for flow content', () => {
    render(<Badge as="div">Block</Badge>);
    expect(screen.getByText('Block').tagName).toBe('DIV');
  });

  it('paints the success and warning variants from semantic tokens', () => {
    render(
      <>
        <Badge variant="success">Live</Badge>
        <Badge variant="warning">Stale</Badge>
      </>
    );
    expect(screen.getByText('Live')).toHaveClass(
      'bg-(--success)/15',
      'text-(--success)'
    );
    expect(screen.getByText('Stale')).toHaveClass(
      'bg-(--warning)/15',
      'text-(--warning)'
    );
  });

  it('forwards a ref to the rendered element', () => {
    const ref = createRef<HTMLElement>();
    render(<Badge ref={ref}>Ref</Badge>);
    expect(ref.current).toBe(screen.getByText('Ref'));
  });

  it('forwards a ref to the div it was asked to render', () => {
    const ref = createRef<HTMLElement>();
    render(
      <Badge as="div" ref={ref}>
        Ref
      </Badge>
    );
    expect(ref.current).toBe(screen.getByText('Ref'));
  });
});
