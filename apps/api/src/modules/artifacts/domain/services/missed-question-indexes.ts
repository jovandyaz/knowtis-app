interface GradedAnswer {
  questionIndex: number;
  correct: boolean;
}

export function missedQuestionIndexes(review: GradedAnswer[]): number[] {
  const missed = new Set<number>();
  for (const answer of review) {
    if (!answer.correct) {
      missed.add(answer.questionIndex);
    }
  }
  return [...missed].sort((a, b) => a - b);
}
