// @vitest-environment jsdom
import { render, renderHook, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { definePermissions } from '../lib/define-permissions';
import type { Ability } from '../lib/types';
import { createPermissionContext } from './create-permission-context';

type TestAction = 'read' | 'update' | 'delete';
type TestSubject = 'Article' | 'all';
type TestAbility = Ability<TestAction, TestSubject>;

describe('createPermissionContext', () => {
  const { PermissionProvider, useAbility, usePermission, Can } =
    createPermissionContext<TestAbility>();

  it('should provide ability via context', () => {
    const ability = definePermissions<TestAbility>((allow) => {
      allow('read', 'Article');
    });

    const { result } = renderHook(() => useAbility(), {
      wrapper: ({ children }) => (
        <PermissionProvider ability={ability}>{children}</PermissionProvider>
      ),
    });

    expect(result.current.can('read', 'Article')).toBe(true);
    expect(result.current.can('update', 'Article')).toBe(false);
  });

  it('usePermission should return boolean for permitted action', () => {
    const ability = definePermissions<TestAbility>((allow) => {
      allow('read', 'Article');
    });

    const { result } = renderHook(() => usePermission('read', 'Article'), {
      wrapper: ({ children }) => (
        <PermissionProvider ability={ability}>{children}</PermissionProvider>
      ),
    });

    expect(result.current).toBe(true);
  });

  it('usePermission should return false for unpermitted action', () => {
    const ability = definePermissions<TestAbility>((allow) => {
      allow('read', 'Article');
    });

    const { result } = renderHook(() => usePermission('update', 'Article'), {
      wrapper: ({ children }) => (
        <PermissionProvider ability={ability}>{children}</PermissionProvider>
      ),
    });

    expect(result.current).toBe(false);
  });

  it('should throw when useAbility is used outside provider', () => {
    expect(() => {
      renderHook(() => useAbility());
    }).toThrow('useAbility must be used within a PermissionProvider');
  });

  it('Can should render children for permitted action', () => {
    const ability = definePermissions<TestAbility>((allow) => {
      allow('read', 'Article');
    });

    render(
      <PermissionProvider ability={ability}>
        <Can do="read" on="Article">
          <span data-testid="permitted">Visible</span>
        </Can>
        <Can do="update" on="Article">
          <span data-testid="forbidden">Hidden</span>
        </Can>
      </PermissionProvider>
    );

    expect(screen.getByTestId('permitted')).toBeDefined();
    expect(screen.queryByTestId('forbidden')).toBeNull();
  });

  it('Can should render fallback for unpermitted action', () => {
    const ability = definePermissions<TestAbility>((allow) => {
      allow('read', 'Article');
    });

    render(
      <PermissionProvider ability={ability}>
        <Can
          do="update"
          on="Article"
          fallback={<span data-testid="denied">No access</span>}
        >
          <span data-testid="content">Content</span>
        </Can>
      </PermissionProvider>
    );

    expect(screen.queryByTestId('content')).toBeNull();
    expect(screen.getByTestId('denied')).toBeDefined();
  });
});
