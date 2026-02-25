interface SectionHeaderProps {
  title: string;
  description: string;
}

export function SectionHeader({ title, description }: SectionHeaderProps) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-(--foreground)">{title}</h3>
      <p className="mt-1 text-sm text-(--muted-foreground)">{description}</p>
    </div>
  );
}
