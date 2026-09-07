import { Inject, Injectable } from '@nestjs/common';

import type { StudyStats } from '@knowtis/shared-types';

import {
  FLASHCARD_PROGRESS_REPOSITORY,
  type FlashcardProgressRepository,
} from '../../domain/ports/artifact.repository';
import { toStudyStats } from '../services/study-session.builder';
import { localDateKey } from '../services/study-streak';

interface GetStudyStatsInput {
  userId: string;
  timeZone: string;
}

@Injectable()
export class GetStudyStatsHandler {
  constructor(
    @Inject(FLASHCARD_PROGRESS_REPOSITORY)
    private readonly progressRepo: FlashcardProgressRepository
  ) {}

  async execute(input: GetStudyStatsInput): Promise<StudyStats> {
    const activity = await this.progressRepo.getStudyActivity(
      input.userId,
      input.timeZone
    );
    return toStudyStats(activity, localDateKey(new Date(), input.timeZone));
  }
}
