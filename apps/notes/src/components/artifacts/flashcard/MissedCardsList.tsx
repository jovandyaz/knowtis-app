import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ChevronDown } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import { CARD_STATUS, type CardResult } from '@knowtis/shared-types';

interface MissedCardsListProps {
  cards: CardResult[];
}

export function MissedCardsList({ cards }: MissedCardsListProps) {
  const { t } = useTranslation('notes');
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const missedCards = cards.filter((card) => card.status === CARD_STATUS.WRONG);

  if (missedCards.length === 0) {
    return null;
  }

  function toggleCard(index: number) {
    setExpandedIndex((prev) => (prev === index ? null : index));
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <h3 className="text-sm font-medium">
        {t('ai.artifacts.flashcards.summary.missedCards')}
      </h3>

      <div className="mt-3 space-y-2 max-h-48 overflow-y-auto">
        {missedCards.map((card, i) => (
          <motion.div
            key={card.cardIndex}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, duration: 0.2 }}
          >
            <button
              type="button"
              className="w-full text-left rounded-lg bg-white/5 p-3 hover:bg-white/10 transition-colors"
              onClick={() => toggleCard(i)}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="line-clamp-1 text-sm">{card.front}</span>
                <ChevronDown
                  className="h-4 w-4 shrink-0 transition-transform duration-200"
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
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="border-t border-white/10 mx-3 pt-2 pb-1">
                    <p className="text-sm text-muted-foreground">{card.back}</p>
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
