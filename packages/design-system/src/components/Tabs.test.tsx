import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { Tabs, TabsContent, TabsList, TabsTrigger } from './Tabs';

function renderTabs() {
  return render(
    <Tabs defaultValue="one">
      <TabsList>
        <TabsTrigger value="one">One</TabsTrigger>
        <TabsTrigger value="two">Two</TabsTrigger>
      </TabsList>
      <TabsContent value="one">First panel</TabsContent>
      <TabsContent value="two">Second panel</TabsContent>
    </Tabs>
  );
}

describe('Tabs', () => {
  it('shows only the active tab content', () => {
    renderTabs();
    expect(screen.getByRole('tabpanel', { name: 'One' })).toHaveTextContent(
      'First panel'
    );
    expect(
      screen.queryByRole('tabpanel', { name: 'Two' })
    ).not.toBeInTheDocument();
  });

  it('switches content when another tab is clicked', async () => {
    renderTabs();
    await userEvent.click(screen.getByRole('tab', { name: 'Two' }));
    expect(screen.getByRole('tabpanel', { name: 'Two' })).toHaveTextContent(
      'Second panel'
    );
    expect(
      screen.queryByRole('tabpanel', { name: 'One' })
    ).not.toBeInTheDocument();
  });

  it('marks the active trigger as selected for assistive tech', () => {
    renderTabs();
    expect(screen.getByRole('tab', { name: 'One' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  it('moves selection to the next tab with ArrowRight', async () => {
    const user = userEvent.setup();
    renderTabs();
    await user.click(screen.getByRole('tab', { name: 'One' }));
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Two' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });
});
