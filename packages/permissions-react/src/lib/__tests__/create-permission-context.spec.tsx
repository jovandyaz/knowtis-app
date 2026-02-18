import { definePermissions } from '../../../../permissions/src/lib/define-permissions';
import type { Ability } from '../../../../permissions/src/lib/types';
import { render, screen } from '@testing-library/react';

import { createPermissionContext } from '../create-permission-context';

type AppAbility = Ability<'read' | 'write' | 'delete', 'Note' | 'User'>;

const { PermissionProvider, Can, useAbility, usePermission } =
  createPermissionContext<AppAbility>();

function buildAbility(
  grants: Array<{
    action: 'read' | 'write' | 'delete';
    subject: 'Note' | 'User';
  }>
) {
  return definePermissions<AppAbility>((allow) => {
    for (const { action, subject } of grants) {
      allow(action, subject);
    }
  });
}

describe('createPermissionContext', () => {
  describe('PermissionProvider + useAbility', () => {
    function AbilityConsumer() {
      const ability = useAbility();
      return (
        <span data-testid="result">
          {ability.can('read', 'Note') ? 'yes' : 'no'}
        </span>
      );
    }

    it('provides ability via context', () => {
      const ability = buildAbility([{ action: 'read', subject: 'Note' }]);

      render(
        <PermissionProvider ability={ability}>
          <AbilityConsumer />
        </PermissionProvider>
      );

      expect(screen.getByTestId('result')).toHaveTextContent('yes');
    });

    it('throws when useAbility is used outside PermissionProvider', () => {
      // Suppress React error boundary console noise
      const spy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);

      expect(() => render(<AbilityConsumer />)).toThrow(
        'useAbility must be used within a PermissionProvider'
      );

      spy.mockRestore();
    });
  });

  describe('usePermission', () => {
    function PermissionChecker({
      action,
      subject,
    }: {
      action: 'read' | 'write' | 'delete';
      subject: 'Note' | 'User';
    }) {
      const allowed = usePermission(action, subject);
      return <span data-testid="allowed">{allowed ? 'true' : 'false'}</span>;
    }

    it('returns true when permission is granted', () => {
      const ability = buildAbility([{ action: 'write', subject: 'Note' }]);

      render(
        <PermissionProvider ability={ability}>
          <PermissionChecker action="write" subject="Note" />
        </PermissionProvider>
      );

      expect(screen.getByTestId('allowed')).toHaveTextContent('true');
    });

    it('returns false when permission is denied', () => {
      const ability = buildAbility([{ action: 'read', subject: 'Note' }]);

      render(
        <PermissionProvider ability={ability}>
          <PermissionChecker action="delete" subject="User" />
        </PermissionProvider>
      );

      expect(screen.getByTestId('allowed')).toHaveTextContent('false');
    });
  });

  describe('Can component', () => {
    it('renders children when permission is granted', () => {
      const ability = buildAbility([{ action: 'read', subject: 'Note' }]);

      render(
        <PermissionProvider ability={ability}>
          <Can do="read" on="Note">
            <span data-testid="content">Visible</span>
          </Can>
        </PermissionProvider>
      );

      expect(screen.getByTestId('content')).toBeInTheDocument();
    });

    it('renders fallback when permission is denied', () => {
      const ability = buildAbility([{ action: 'read', subject: 'Note' }]);

      render(
        <PermissionProvider ability={ability}>
          <Can
            do="delete"
            on="Note"
            fallback={<span data-testid="fallback">Denied</span>}
          >
            <span data-testid="content">Visible</span>
          </Can>
        </PermissionProvider>
      );

      expect(screen.queryByTestId('content')).not.toBeInTheDocument();
      expect(screen.getByTestId('fallback')).toHaveTextContent('Denied');
    });

    it('renders nothing when permission is denied and no fallback provided', () => {
      const ability = buildAbility([{ action: 'read', subject: 'Note' }]);

      render(
        <PermissionProvider ability={ability}>
          <Can do="write" on="User">
            <span data-testid="content">Visible</span>
          </Can>
        </PermissionProvider>
      );

      expect(screen.queryByTestId('content')).not.toBeInTheDocument();
    });
  });
});
