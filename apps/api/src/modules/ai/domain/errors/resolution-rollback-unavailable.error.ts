/** A platform intent no longer holds the active and previous models a roll back confirmed. */
export class ResolutionRollbackUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResolutionRollbackUnavailableError';
  }
}
