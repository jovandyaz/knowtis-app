import { createRef } from 'react';

import { render, screen } from '@testing-library/react';
import type { StickToBottomContext } from 'use-stick-to-bottom';
import { describe, expect, it } from 'vitest';

import { Conversation, ConversationContent } from './conversation';

describe('ConversationContent', () => {
  it('makes the log the element that sticks to the bottom as it scrolls', () => {
    const context = createRef<StickToBottomContext>();
    render(
      <Conversation contextRef={context}>
        <ConversationContent logProps={{ 'aria-label': 'Thread' }}>
          <p>hola</p>
        </ConversationContent>
      </Conversation>
    );

    const log = screen.getByRole('log', { name: 'Thread' });
    expect(context.current?.scrollRef.current).toBe(log);
    expect(context.current?.contentRef.current).toBe(
      screen.getByText('hola').parentElement
    );
    expect(log).toHaveStyle({ height: '100%', width: '100%' });
  });
});
