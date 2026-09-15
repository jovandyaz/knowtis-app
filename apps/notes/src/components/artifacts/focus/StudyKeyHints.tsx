import { Kbd } from '@knowtis/design-system';

export interface StudyKeyHint {
  keys: string[];
  label: string;
}

interface StudyKeyHintsProps {
  hints: StudyKeyHint[];
}

export function StudyKeyHints({ hints }: StudyKeyHintsProps) {
  return (
    <ul className="hidden flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-(--muted-foreground) md:flex">
      {hints.map((hint) => (
        <li key={hint.label} className="flex items-center gap-1.5">
          {hint.keys.map((key) => (
            <Kbd key={key}>{key}</Kbd>
          ))}
          <span>{hint.label}</span>
        </li>
      ))}
    </ul>
  );
}
