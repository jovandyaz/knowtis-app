import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ChevronDown } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import { Button, useMotionPreset } from '@knowtis/design-system';
import { CARD_STATUS, type CardResult } from '@knowtis/shared-types';

interface MissedCardsListProps {
  cards: CardResult[];
}

export function MissedCardsList({ cards }: MissedCardsListProps) {
  const { t } = useTranslation('notes');
  const preset = useMotionPreset();
  const disclosureId = useId();
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const missedCards = cards.filter((card) => card.status === CARD_STATUS.WRONG);

  if (missedCards.length === 0) {
    return null;
  }

  function toggleCard(index: number) {
    setExpandedIndex((previous) => (previous === index ? null : index));
  }

  return (
    <section>
      <h3 className="font-sans text-base leading-6 font-medium">
        {t('ai.artifacts.flashcards.summary.toRevisit')}
      </h3>

      <div className="mt-3 space-y-2">
        {missedCards.map((card, index) => {
          const expanded = expandedIndex === index;
          const triggerId = `${disclosureId}-trigger-${index}`;
          const regionId = `${disclosureId}-region-${index}`;

          return (
            <div key={`${card.artifactId}:${card.cardIndex}`}>
              <Button
                id={triggerId}
                type="button"
                variant="ghost"
                className="h-auto min-h-12 w-full justify-between whitespace-normal px-3 py-3 text-left focus-visible:ring-2"
                onClick={() => toggleCard(index)}
                aria-expanded={expanded}
                aria-controls={regionId}
              >
                <span className="min-w-0 flex-1 wrap-anywhere text-sm">
                  {card.front}
                </span>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 transition-transform duration-(--motion-duration-fast) ease-standard motion-reduce:transition-none ${expanded ? 'rotate-180' : ''}`}
                />
              </Button>

              <AnimatePresence>
                {expanded ? (
                  <motion.div
                    id={regionId}
                    role="region"
                    aria-labelledby={triggerId}
                    initial={preset.reduced ? false : { height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={preset.fade}
                    className="overflow-hidden"
                  >
                    <p className="mx-3 wrap-anywhere border-t border-(--border) pt-2 pb-1 text-sm text-(--muted-foreground)">
                      {card.back}
                    </p>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </section>
  );
}
