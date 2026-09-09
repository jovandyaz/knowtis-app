import { createRef } from 'react';

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Button } from './Button';

describe('Button', () => {
  it('keeps the coarse-pointer touch floor when a consumer shrinks the height', () => {
    render(<Button className="h-7">Save</Button>);
    const button = screen.getByRole('button', { name: 'Save' });

    expect(button).toHaveClass('pointer-coarse:min-h-11', 'h-7');
    expect(button).not.toHaveClass('h-9');
  });

  it('widens the icon size to a full touch target on coarse pointers', () => {
    render(<Button size="icon" aria-label="Shuffle" />);
    const button = screen.getByRole('button', { name: 'Shuffle' });

    expect(button).toHaveClass(
      'pointer-coarse:min-h-11',
      'pointer-coarse:min-w-11'
    );
  });

  it('leaves fine-pointer sizing to the size variant alone', () => {
    render(<Button>Save</Button>);
    const button = screen.getByRole('button', { name: 'Save' });

    expect(button).toHaveClass('h-9', 'px-4', 'py-2');
  });

  it('declares the pointer cursor so consumers never have to', () => {
    render(<Button>Save</Button>);

    expect(screen.getByRole('button', { name: 'Save' })).toHaveClass(
      'cursor-pointer'
    );
  });

  it('forwards a ref to the rendered element', () => {
    const ref = createRef<HTMLButtonElement>();
    render(<Button ref={ref}>Save</Button>);

    expect(ref.current).toBe(screen.getByRole('button', { name: 'Save' }));
  });
});
