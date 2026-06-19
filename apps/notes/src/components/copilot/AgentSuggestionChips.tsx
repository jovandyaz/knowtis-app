import { useTranslation } from 'react-i18next';

const SUGGESTION_KEYS = [
  'ai.copilot.empty.suggestion.summarize',
  'ai.copilot.empty.suggestion.improve',
  'ai.copilot.empty.suggestion.sources',
  'ai.copilot.empty.suggestion.translate',
] as const;

export function AgentSuggestionChips({
  onSelect,
}: {
  onSelect: (prompt: string) => void;
}) {
  const { t } = useTranslation('notes');
  return (
    <div className="flex flex-wrap justify-center gap-1.5">
      {SUGGESTION_KEYS.map((key) => {
        const label = t(key);
        return (
          <button
            key={key}
            type="button"
            onClick={() => onSelect(label)}
            className="rounded-full border border-border bg-muted/40 px-3 py-1 text-xs text-foreground transition-colors hover:bg-muted active:scale-[0.98] motion-reduce:active:scale-100"
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
