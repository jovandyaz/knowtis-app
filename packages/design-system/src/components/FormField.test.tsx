import { createRef } from 'react';

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { FormField } from './FormField';

describe('FormField', () => {
  it('forwards a ref to the rendered element', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <FormField ref={ref} id="email" label="Email">
        <input id="email" />
      </FormField>
    );
    expect(ref.current).toBe(screen.getByLabelText('Email').parentElement);
  });
});
