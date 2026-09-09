import { createRef } from 'react';

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TOUCH_TARGET_CLASS } from '../constants/touch-target';
import { Button } from './Button';

describe('Button', () => {
  it('keeps the coarse-pointer touch floor when a consumer shrinks the height', () => {
    render(<Button className="h-7">Save</Button>);
    const button = screen.getByRole('button', { name: 'Save' });

    expect(button).toHaveClass(...TOUCH_TARGET_CLASS.split(' '), 'h-7');
    expect(button).not.toHaveClass('h-9');
  });

  it('keeps the coarse-pointer touch floor when a consumer narrows the width', () => {
    render(<Button className="w-8">OK</Button>);
    const button = screen.getByRole('button', { name: 'OK' });

    expect(button).toHaveClass(...TOUCH_TARGET_CLASS.split(' '), 'w-8');
  });

  it('floors the icon size, whose fine-pointer box is 32px square', () => {
    render(<Button size="icon" aria-label="Shuffle" />);
    const button = screen.getByRole('button', { name: 'Shuffle' });

    expect(button).toHaveClass(...TOUCH_TARGET_CLASS.split(' '), 'h-8', 'w-8');
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
