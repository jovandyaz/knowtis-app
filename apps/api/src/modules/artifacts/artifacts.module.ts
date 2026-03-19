import { Module } from '@nestjs/common';

import { AIModule } from '../ai';
import { NotesModule } from '../notes';
import {
  AIGenerationPipeline,
  DeleteArtifactHandler,
  GenerateArtifactHandler,
  GetArtifactHandler,
  GetArtifactsHandler,
  GetFlashcardProgressHandler,
  GetQuizAttemptsHandler,
  GetStudySessionHandler,
  LearnTopicHandler,
  ReviewCardHandler,
  SubmitQuizAttemptHandler,
} from './application';
import { ArtifactsController } from './artifacts.controller';
import {
  ARTIFACT_READ_REPOSITORY,
  ARTIFACT_WRITE_REPOSITORY,
  FLASHCARD_PROGRESS_REPOSITORY,
  QUIZ_ATTEMPT_REPOSITORY,
} from './domain';
import { FlashcardStudyController } from './flashcard-study.controller';
import {
  DrizzleArtifactRepository,
  DrizzleFlashcardProgressRepository,
  DrizzleQuizAttemptRepository,
} from './infrastructure';
import { QuizController } from './quiz.controller';

@Module({
  imports: [AIModule, NotesModule],
  controllers: [ArtifactsController, FlashcardStudyController, QuizController],
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
    LearnTopicHandler,
    DeleteArtifactHandler,
    ReviewCardHandler,
    SubmitQuizAttemptHandler,
    GetArtifactHandler,
    GetArtifactsHandler,
    GetStudySessionHandler,
    GetFlashcardProgressHandler,
    GetQuizAttemptsHandler,
  ],
})
export class ArtifactsModule {}
