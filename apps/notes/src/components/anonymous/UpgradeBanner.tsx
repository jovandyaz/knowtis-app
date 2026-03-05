import { useState } from 'react';

import { Link } from '@tanstack/react-router';

import { useAuthUser } from '@jovandyaz/auth-react';
import { X } from 'lucide-react';

export function UpgradeBanner() {
  const user = useAuthUser();
  const [dismissed, setDismissed] = useState(false);

  if (!user?.isAnonymous || dismissed) {
    return null;
  }

  return (
    <div className="relative overflow-hidden bg-gradient-to-r from-(--primary)/10 via-(--primary)/5 to-transparent border-b border-(--border) px-4 py-2.5">
      <div className="flex items-center justify-between max-w-6xl mx-auto">
        <p className="text-sm text-(--muted-foreground)">
          <span className="font-medium text-(--foreground)">
            You're using Knowtis as a guest.
          </span>{' '}
          Sign up to unlock unlimited notes, collaboration, and multi-device
          sync.
        </p>
        <div className="flex items-center gap-2 shrink-0 ml-4">
          <Link
            to="/register"
            className="text-sm font-medium text-(--primary) hover:underline"
          >
            Create account
          </Link>
          <button
            onClick={() => setDismissed(true)}
            className="p-1 text-(--muted-foreground) hover:text-(--foreground) transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
