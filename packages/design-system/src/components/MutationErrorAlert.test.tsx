import { createRef } from 'react';

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MutationErrorAlert } from './MutationErrorAlert';

describe('MutationErrorAlert', () => {
  it('forwards a ref to the rendered element', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <MutationErrorAlert
        ref={ref}
        error={new Error('Could not save')}
        isError
        fallbackMessage="Something went wrong"
      />
    );
    expect(ref.current).toBe(screen.getByRole('alert'));
  });
});
