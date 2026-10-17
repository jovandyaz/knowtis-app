import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Streamdown } from 'streamdown';
import { describe, expect, it } from 'vitest';

import { UNTRUSTED_MARKDOWN_PROPS } from './untrusted-markdown';

describe('UNTRUSTED_MARKDOWN_PROPS', () => {
  it('routes a link through the confirmation instead of navigating', async () => {
    render(
      <Streamdown mode="static" {...UNTRUSTED_MARKDOWN_PROPS}>
        {'[go](https://example.com/page)'}
      </Streamdown>
    );

    expect(screen.queryByRole('link')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'go' }));
    expect(
      await screen.findByText(/https:\/\/example\.com\/page/)
    ).toBeInTheDocument();
  });
});
