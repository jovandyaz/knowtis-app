interface BarListItem {
  label: string;
  value: number;
  displayValue: string;
}

interface BarListProps {
  items: BarListItem[];
  ariaLabel: string;
}

export function BarList({ items, ariaLabel }: BarListProps) {
  const max = Math.max(...items.map((item) => item.value), Number.EPSILON);
  return (
    <ul aria-label={ariaLabel} className="flex flex-col gap-2">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-3">
          <div className="relative h-7 flex-1 overflow-hidden rounded bg-(--muted)">
            <div
              data-bar
              className="absolute inset-y-0 left-0 rounded bg-(--chart-1)/25"
              style={{ width: `${(item.value / max) * 100}%` }}
            />
            <span className="absolute inset-y-0 left-2 flex max-w-[85%] items-center truncate text-xs">
              {item.label}
            </span>
          </div>
          <span className="w-24 shrink-0 text-right text-xs font-medium tabular-nums">
            {item.displayValue}
          </span>
        </li>
      ))}
    </ul>
  );
}
