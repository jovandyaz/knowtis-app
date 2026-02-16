import { useMemo } from 'react';

import { cn } from '../utils';

interface PasswordCheck {
  readonly label: string;
  readonly test: (password: string) => boolean;
}

interface PasswordStrengthProps {
  password: string;
  checks: PasswordCheck[];
}

function calculateStrength(password: string, checks: PasswordCheck[]) {
  const results = checks.map((check) => ({
    label: check.label,
    met: check.test(password),
  }));
  const score = results.filter((c) => c.met).length;
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
  return { score, label: labels[score] || '', checks: results };
}

function PasswordStrength({ password, checks }: PasswordStrengthProps) {
  const {
    score,
    label,
    checks: results,
  } = useMemo(() => calculateStrength(password, checks), [password, checks]);

  if (!password) {
    return null;
  }

  const colors = [
    '',
    'bg-(--destructive)',
    'bg-orange-500',
    'bg-yellow-500',
    'bg-green-500',
  ];

  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={cn(
              'h-1.5 flex-1 rounded-full transition-colors',
              i <= score ? colors[score] : 'bg-(--muted)'
            )}
          />
        ))}
      </div>
      <p className="text-xs text-(--muted-foreground)">{label}</p>
      <ul className="space-y-1">
        {results.map((check) => (
          <li
            key={check.label}
            className={cn(
              'text-xs flex items-center gap-1',
              check.met ? 'text-green-600' : 'text-(--muted-foreground)'
            )}
          >
            {check.met ? '\u2713' : '\u25CB'} {check.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

export { PasswordStrength, type PasswordStrengthProps };
