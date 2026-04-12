import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { logger } from './logger';

describe('logger', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should log errors with context', () => {
    const error = new Error('test error');
    logger.error('Something failed', { error, context: 'TestComponent' });
    expect(console.error).toHaveBeenCalledWith(
      '[TestComponent]',
      'Something failed',
      error
    );
  });

  it('should log warnings with context', () => {
    logger.warn('Something unexpected', { context: 'TestHook' });
    expect(console.warn).toHaveBeenCalledWith(
      '[TestHook]',
      'Something unexpected'
    );
  });

  it('should log info with context', () => {
    logger.info('Operation completed', { context: 'TestService' });
    // eslint-disable-next-line no-console
    expect(console.info).toHaveBeenCalledWith(
      '[TestService]',
      'Operation completed'
    );
  });

  it('should log errors without context', () => {
    logger.error('Something failed');
    expect(console.error).toHaveBeenCalledWith('Something failed');
  });

  it('should log warnings without context', () => {
    logger.warn('Something unexpected');
    expect(console.warn).toHaveBeenCalledWith('Something unexpected');
  });

  it('should log info without context', () => {
    logger.info('Operation completed');
    // eslint-disable-next-line no-console
    expect(console.info).toHaveBeenCalledWith('Operation completed');
  });

  it('should include error object in log args', () => {
    const error = new Error('network failure');
    logger.error('Request failed', { error });
    expect(console.error).toHaveBeenCalledWith('Request failed', error);
  });
});
