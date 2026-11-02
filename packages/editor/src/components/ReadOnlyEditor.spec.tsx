import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ReadOnlyEditor } from './ReadOnlyEditor';

describe('ReadOnlyEditor', () => {
  it('stays a named, read-only textbox after its parent re-renders', () => {
    const { rerender } = render(<ReadOnlyEditor content="<p>Uno</p>" />);

    rerender(<ReadOnlyEditor content="<p>Uno</p>" />);

    const content = screen.getByRole('textbox', {
      name: 'editor.contentLabel',
    });
    expect(content).toHaveAttribute('aria-readonly', 'true');
  });
});
