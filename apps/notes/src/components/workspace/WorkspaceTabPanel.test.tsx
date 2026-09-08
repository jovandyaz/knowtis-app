import { useWorkspaceStore } from '@/stores/workspace.store';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { workspacePanelId, workspaceTabId } from './workspace-tab-ids';
import { WorkspaceTabPanel } from './WorkspaceTabPanel';

const child = () => screen.getByTestId('panel-child');
const panel = () => child().parentElement;

beforeEach(() => {
  useWorkspaceStore.setState({ activeTab: 'note' });
});

describe('WorkspaceTabPanel', () => {
  it('renders a plain wrapper with no tab semantics when untabbed', () => {
    useWorkspaceStore.setState({ activeTab: 'estudio' });

    render(
      <WorkspaceTabPanel tab="note" tabbed={false}>
        <div data-testid="panel-child" />
      </WorkspaceTabPanel>
    );

    expect(panel()).not.toHaveAttribute('id');
    expect(panel()).not.toHaveAttribute('role');
    expect(panel()).not.toHaveAttribute('aria-labelledby');
    expect(panel()).not.toHaveAttribute('tabindex');
    expect(panel()).not.toHaveClass('hidden');
  });

  it('labels the active panel and leaves it visible when tabbed', () => {
    render(
      <WorkspaceTabPanel tab="note" tabbed>
        <div data-testid="panel-child" />
      </WorkspaceTabPanel>
    );

    expect(panel()).toHaveAttribute('id', workspacePanelId('note'));
    expect(panel()).toHaveAttribute('role', 'tabpanel');
    expect(panel()).toHaveAttribute('aria-labelledby', workspaceTabId('note'));
    expect(panel()).toHaveAttribute('tabindex', '0');
    expect(panel()).not.toHaveClass('hidden');
  });

  it('hides an inactive panel without unmounting its children', () => {
    useWorkspaceStore.setState({ activeTab: 'estudio' });

    render(
      <WorkspaceTabPanel tab="note" tabbed>
        <div data-testid="panel-child" />
      </WorkspaceTabPanel>
    );

    expect(panel()).toHaveClass('hidden');
    expect(child()).toBeInTheDocument();
  });
});
