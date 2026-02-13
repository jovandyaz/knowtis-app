import { memo } from 'react';

import type { CollaborativeUser } from '@/types';
import { Users } from 'lucide-react';

import { Badge, cn } from '@knowtis/design-system';

/**
 * Props for the CollaborationIndicator component
 * @param users - Array of collaborative users
 * @param className - Optional className for the component
 */
interface CollaborationIndicatorProps {
  users: CollaborativeUser[];
  className?: string;
}

export const CollaborationIndicator = memo(function CollaborationIndicator({
  users,
  className,
}: CollaborationIndicatorProps) {
  if (users.length === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        'mb-2 flex items-center gap-2 rounded-lg bg-(--primary)/10 px-3 py-2',
        className
      )}
    >
      <Users className="h-4 w-4 text-(--primary)" />
      <Badge variant="secondary" className="text-xs">
        {users.length} {users.length === 1 ? 'user' : 'users'} editing
      </Badge>
      <div className="flex -space-x-2">
        {users.slice(0, 5).map((user) => (
          <div
            key={user.id}
            className={cn(
              'flex h-6 w-6 items-center justify-center rounded-full border-2 border-(--card) text-xs font-medium text-white'
            )}
            style={{ backgroundColor: user.color }}
            title={user.name}
          >
            {user.name.charAt(0).toUpperCase()}
          </div>
        ))}
        {users.length > 5 && (
          <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-(--card) bg-(--muted) text-xs font-medium text-(--muted-foreground)">
            +{users.length - 5}
          </div>
        )}
      </div>
    </div>
  );
});
