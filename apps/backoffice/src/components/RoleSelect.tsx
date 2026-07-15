import { useAuthUser } from '@jovandyaz/auth-react';

import { useUpdateUserRole, type AdminUser } from '@knowtis/data-access-admin';

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
      onChange={(event) =>
        updateRole.mutate({
          userId: user.id,
          role: event.target.value as AdminUser['role'],
        })
      }
    >
      <option value="user">user</option>
      <option value="admin">admin</option>
    </select>
  );
}
