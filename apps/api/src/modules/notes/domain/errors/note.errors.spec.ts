import { NoteErrorCodes, NoteErrors } from './note.errors';

describe('NoteErrors', () => {
  it('should have INTERNAL_ERROR code', () => {
    expect(NoteErrorCodes.INTERNAL_ERROR).toBe('INTERNAL_ERROR');
  });

  it('should create internalError with message', () => {
    const error = NoteErrors.internalError('DB connection failed');
    expect(error.code).toBe('INTERNAL_ERROR');
    expect(error.message).toBe('Internal error: DB connection failed');
  });

  it('should create persistenceError with entity context', () => {
    const error = NoteErrors.persistenceError('delete', 'abc-123');
    expect(error.code).toBe('INTERNAL_ERROR');
    expect(error.message).toContain('delete');
    expect(error.message).toContain('abc-123');
  });
});
