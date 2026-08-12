import type { ReactNode } from 'react';

interface ConfigSectionProps {
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
}

export function ConfigSection({
  title,
  description,
  action,
  children,
}: ConfigSectionProps) {
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-sm text-(--muted-foreground)">{description}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
