import { useTranslation } from 'react-i18next';

import { Globe, PenLine, Sparkles, type LucideIcon } from 'lucide-react';

interface CapabilityRow {
  labelKey:
    | 'ai.copilot.empty.capability.understand.label'
    | 'ai.copilot.empty.capability.write.label'
    | 'ai.copilot.empty.capability.research.label';
  hintKey:
    | 'ai.copilot.empty.capability.understand.hint'
    | 'ai.copilot.empty.capability.write.hint'
    | 'ai.copilot.empty.capability.research.hint';
  promptKey:
    | 'ai.copilot.empty.capability.understand.prompt'
    | 'ai.copilot.empty.capability.write.prompt'
    | 'ai.copilot.empty.capability.research.prompt';
  icon: LucideIcon;
}

const CAPABILITY_ROWS: readonly CapabilityRow[] = [
  {
    labelKey: 'ai.copilot.empty.capability.understand.label',
    hintKey: 'ai.copilot.empty.capability.understand.hint',
    promptKey: 'ai.copilot.empty.capability.understand.prompt',
    icon: Sparkles,
  },
  {
    labelKey: 'ai.copilot.empty.capability.write.label',
    hintKey: 'ai.copilot.empty.capability.write.hint',
    promptKey: 'ai.copilot.empty.capability.write.prompt',
    icon: PenLine,
  },
  {
    labelKey: 'ai.copilot.empty.capability.research.label',
    hintKey: 'ai.copilot.empty.capability.research.hint',
    promptKey: 'ai.copilot.empty.capability.research.prompt',
    icon: Globe,
  },
];

export function AgentCapabilityRows({
  onSelect,
}: {
  onSelect: (prompt: string) => void;
}) {
  const { t } = useTranslation('notes');
  return (
    <div className="flex w-full max-w-xs flex-col gap-1.5">
      {CAPABILITY_ROWS.map(({ labelKey, hintKey, promptKey, icon: Icon }) => {
        const label = t(labelKey);
        const hint = t(hintKey);
        return (
          <button
            key={labelKey}
            type="button"
            onClick={() => onSelect(t(promptKey))}
            aria-label={`${label}. ${hint}`}
            className="flex min-h-10 w-full items-center gap-2.5 rounded-xl border border-border bg-muted/40 px-3 py-2 text-left transition-colors hover:bg-muted active:scale-[0.99] motion-reduce:active:scale-100"
          >
            <Icon className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
            <span className="min-w-0 truncate text-xs font-medium text-foreground">
              {label}
            </span>
            <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
              {hint}
            </span>
          </button>
        );
      })}
    </div>
  );
}
