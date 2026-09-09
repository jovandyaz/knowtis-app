import { createRef } from 'react';

import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PasswordStrength } from './PasswordStrength';

const CHECKS = [
  {
    label: 'At least 8 characters',
    test: (value: string) => value.length >= 8,
  },
];

describe('PasswordStrength', () => {
  it('forwards a ref to the rendered element', () => {
    const ref = createRef<HTMLDivElement>();
    const { container } = render(
      <PasswordStrength ref={ref} password="hunter22" checks={CHECKS} />
    );
    expect(ref.current).toBe(container.firstElementChild);
  });
});
