import type { ReactNode } from 'react';

interface ConfigSectionProps {
  title: string;
  description: string;
  children: ReactNode;
}

export function ConfigSection({
  title,
  description,
  children,
}: ConfigSectionProps) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-(--muted-foreground)">{description}</p>
      </div>
      {children}
    </section>
  );
}
