import { Inject, Injectable } from '@nestjs/common';

import type { StudySession } from '@knowtis/shared-types';

import {
  DUE_CARDS_PER_SESSION,
  FLASHCARD_PROGRESS_REPOSITORY,
  NEW_CARDS_PER_SESSION,
  type FlashcardProgressRepository,
} from '../../domain/ports/artifact.repository';
import {
  buildStudyCards,
  toStudyStats,
} from '../services/study-session.builder';
import { localDateKey } from '../services/study-streak';

interface GetStudySessionInput {
  userId: string;
  timeZone: string;
}

@Injectable()
export class GetStudySessionHandler {
  constructor(
    @Inject(FLASHCARD_PROGRESS_REPOSITORY)
    private readonly progressRepo: FlashcardProgressRepository
  ) {}

  async execute(input: GetStudySessionInput): Promise<StudySession> {
    const today = localDateKey(new Date(), input.timeZone);
    const [due, decks, activity] = await Promise.all([
      this.progressRepo.findDueCards(input.userId, DUE_CARDS_PER_SESSION),
      this.progressRepo.findFlashcardDecks(input.userId),
      this.progressRepo.getStudyActivity(input.userId, input.timeZone),
    ]);

    const cards = buildStudyCards({
      due,
      decks,
      seed: `${input.userId}:${today}`,
      dueLimit: DUE_CARDS_PER_SESSION,
      newLimit: NEW_CARDS_PER_SESSION,
    });

    return { cards, stats: toStudyStats(activity, today) };
  }
}
