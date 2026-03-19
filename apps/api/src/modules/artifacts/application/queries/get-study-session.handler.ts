import { Inject, Injectable } from '@nestjs/common';

import {
  DEFAULT_DUE_CARDS_LIMIT,
  FLASHCARD_PROGRESS_REPOSITORY,
  type FlashcardProgressRepository,
} from '../../domain/ports';

@Injectable()
export class GetStudySessionHandler {
  constructor(
    @Inject(FLASHCARD_PROGRESS_REPOSITORY)
    private readonly progressRepo: FlashcardProgressRepository
  ) {}

  async execute(input: { userId: string; limit?: number }) {
    return this.progressRepo.getDueCards(
      input.userId,
      input.limit ?? DEFAULT_DUE_CARDS_LIMIT
    );
  }
}
