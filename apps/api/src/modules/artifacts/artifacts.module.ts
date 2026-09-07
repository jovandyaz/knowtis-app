import { Module } from '@nestjs/common';

import { AIModule } from '../ai';
import { NotesModule } from '../notes';
import { DeleteArtifactHandler } from './application/commands/delete-artifact.handler';
import { GenerateArtifactHandler } from './application/commands/generate-artifact.handler';
import { ReviewCardHandler } from './application/commands/review-card.handler';
import { SubmitQuizAttemptHandler } from './application/commands/submit-quiz-attempt.handler';
import { GetArtifactHandler } from './application/queries/get-artifact.handler';
import { GetArtifactsHandler } from './application/queries/get-artifacts.handler';
import { GetFlashcardProgressHandler } from './application/queries/get-flashcard-progress.handler';
import { GetLatestQuizAttemptHandler } from './application/queries/get-latest-quiz-attempt.handler';
import { GetQuizAttemptsHandler } from './application/queries/get-quiz-attempts.handler';
import { GetSharedNoteArtifactsHandler } from './application/queries/get-shared-note-artifacts.handler';
import { GetStudySessionHandler } from './application/queries/get-study-session.handler';
import { GetStudyStatsHandler } from './application/queries/get-study-stats.handler';
import { AIGenerationPipeline } from './application/services/ai-generation.pipeline';
import { ArtifactsController } from './artifacts.controller';
import {
  ARTIFACT_READ_REPOSITORY,
  ARTIFACT_WRITE_REPOSITORY,
  FLASHCARD_PROGRESS_REPOSITORY,
  QUIZ_ATTEMPT_REPOSITORY,
} from './domain/ports/artifact.repository';
import { FlashcardStudyController } from './flashcard-study.controller';
import { DrizzleArtifactRepository } from './infrastructure/persistence/drizzle-artifact.repository';
import { DrizzleFlashcardProgressRepository } from './infrastructure/persistence/drizzle-flashcard-progress.repository';
import { DrizzleQuizAttemptRepository } from './infrastructure/persistence/drizzle-quiz-attempt.repository';
import { QuizController } from './quiz.controller';
import { SharedNoteArtifactsController } from './shared-note-artifacts.controller';

@Module({
  imports: [AIModule, NotesModule],
  controllers: [
    ArtifactsController,
    FlashcardStudyController,
    QuizController,
    SharedNoteArtifactsController,
  ],
  providers: [
    DrizzleArtifactRepository,
    {
      provide: ARTIFACT_READ_REPOSITORY,
      useExisting: DrizzleArtifactRepository,
    },
    {
      provide: ARTIFACT_WRITE_REPOSITORY,
      useExisting: DrizzleArtifactRepository,
    },
    {
      provide: FLASHCARD_PROGRESS_REPOSITORY,
      useClass: DrizzleFlashcardProgressRepository,
    },
    {
      provide: QUIZ_ATTEMPT_REPOSITORY,
      useClass: DrizzleQuizAttemptRepository,
    },
    AIGenerationPipeline,
    GenerateArtifactHandler,
    DeleteArtifactHandler,
    ReviewCardHandler,
    SubmitQuizAttemptHandler,
    GetArtifactHandler,
    GetArtifactsHandler,
    GetSharedNoteArtifactsHandler,
    GetStudySessionHandler,
    GetStudyStatsHandler,
    GetFlashcardProgressHandler,
    GetQuizAttemptsHandler,
    GetLatestQuizAttemptHandler,
  ],
})
export class ArtifactsModule {}
