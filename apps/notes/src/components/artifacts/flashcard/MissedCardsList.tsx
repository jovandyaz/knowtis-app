import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ChevronDown } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import { useMotionPreset } from '@knowtis/design-system';
import { CARD_STATUS, type CardResult } from '@knowtis/shared-types';

interface MissedCardsListProps {
  cards: CardResult[];
}

export function MissedCardsList({ cards }: MissedCardsListProps) {
  const { t } = useTranslation('notes');
  const preset = useMotionPreset();
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const missedCards = cards.filter((card) => card.status === CARD_STATUS.WRONG);

  if (missedCards.length === 0) {
    return null;
  }

  function toggleCard(index: number) {
    setExpandedIndex((prev) => (prev === index ? null : index));
  }

  return (
    <div className="rounded-xl border border-(--border) bg-(--card) p-4">
      <h3 className="text-sm font-medium">
        {t('ai.artifacts.flashcards.summary.missedCards')}
      </h3>

      <div className="mt-3 max-h-48 space-y-2 overflow-y-auto">
        {missedCards.map((card, i) => (
          <motion.div
            key={card.cardIndex}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ ...preset.fade, delay: i * preset.stagger }}
          >
            <button
              type="button"
              className="w-full rounded-lg bg-(--muted) p-3 text-left transition-colors duration-(--motion-duration-fast) ease-standard hover:bg-(--accent) motion-reduce:transition-none"
              onClick={() => toggleCard(i)}
              aria-expanded={expandedIndex === i}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="line-clamp-1 text-sm">{card.front}</span>
                <ChevronDown
                  className="h-4 w-4 shrink-0 transition-transform duration-(--motion-duration-fast) ease-standard motion-reduce:transition-none"
                  style={{
                    transform:
                      expandedIndex === i ? 'rotate(180deg)' : 'rotate(0deg)',
                  }}
                />
              </div>
            </button>

            <AnimatePresence>
              {expandedIndex === i && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={preset.fade}
                  className="overflow-hidden"
                >
                  <div className="mx-3 border-t border-(--border) pt-2 pb-1">
                    <p className="text-sm text-(--muted-foreground)">
                      {card.back}
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
