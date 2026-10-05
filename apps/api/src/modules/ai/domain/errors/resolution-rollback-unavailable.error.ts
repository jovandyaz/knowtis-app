/** A platform intent cannot roll back: it has no previous model, or its active model changed since it was read. */
export class ResolutionRollbackUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResolutionRollbackUnavailableError';
  }
}
