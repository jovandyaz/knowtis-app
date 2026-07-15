import { USER_ROLE } from '@jovandyaz/auth';
import { useAuthUser } from '@jovandyaz/auth-react';

import { useUpdateUserRole, type AdminUser } from '@knowtis/data-access-admin';

const ROLE_OPTIONS = [USER_ROLE.USER, USER_ROLE.ADMIN] as const;

function isAdminUserRole(value: string): value is AdminUser['role'] {
  return (ROLE_OPTIONS as readonly string[]).includes(value);
}

interface RoleSelectProps {
  user: AdminUser;
}

export function RoleSelect({ user }: RoleSelectProps) {
  const me = useAuthUser();
  const updateRole = useUpdateUserRole();
  const isSelf = me?.id === user.id;

  return (
    <select
      className="rounded border border-(--border) bg-transparent px-2 py-1 text-sm disabled:opacity-50"
      value={user.role}
      disabled={isSelf || updateRole.isPending}
      aria-label={`Role for ${user.email}`}
      onChange={(event) => {
        const { value } = event.target;
        if (isAdminUserRole(value)) {
          updateRole.mutate({ userId: user.id, role: value });
        }
      }}
    >
      {ROLE_OPTIONS.map((role) => (
        <option key={role} value={role}>
          {role}
        </option>
      ))}
    </select>
  );
}
