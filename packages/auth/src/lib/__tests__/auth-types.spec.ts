import { describe, expect, it } from 'vitest';

import { getPasswordChecks, PASSWORD_REQUIREMENTS } from '../types/auth.types';

describe('getPasswordChecks', () => {
  it('should return an array of checks', () => {
    const checks = getPasswordChecks();
    expect(checks.length).toBeGreaterThan(0);
  });

  it('should include a min-length check', () => {
    const checks = getPasswordChecks();
    const minLengthCheck = checks.find((c) =>
      c.label.includes(`${PASSWORD_REQUIREMENTS.minLength}`)
    );
    expect(minLengthCheck).toBeDefined();
  });

  it('min-length check should pass for long passwords', () => {
    const checks = getPasswordChecks();
    const minLengthCheck = checks.find((c) =>
      c.label.includes(`${PASSWORD_REQUIREMENTS.minLength}`)
    );
    expect(minLengthCheck).toBeDefined();
    expect(minLengthCheck?.test('12345678')).toBe(true);
  });

  it('min-length check should fail for short passwords', () => {
    const checks = getPasswordChecks();
    const minLengthCheck = checks.find((c) =>
      c.label.includes(`${PASSWORD_REQUIREMENTS.minLength}`)
    );
    expect(minLengthCheck).toBeDefined();
    expect(minLengthCheck?.test('123')).toBe(false);
  });

  it('uppercase check should pass when uppercase is present', () => {
    const checks = getPasswordChecks();
    const uppercaseCheck = checks.find((c) => c.label.includes('uppercase'));
    expect(uppercaseCheck).toBeDefined();
    expect(uppercaseCheck?.test('Hello')).toBe(true);
  });

  it('uppercase check should fail when no uppercase', () => {
    const checks = getPasswordChecks();
    const uppercaseCheck = checks.find((c) => c.label.includes('uppercase'));
    expect(uppercaseCheck).toBeDefined();
    expect(uppercaseCheck?.test('hello')).toBe(false);
  });

  it('number check should pass when number is present', () => {
    const checks = getPasswordChecks();
    const numberCheck = checks.find((c) => c.label.includes('number'));
    expect(numberCheck).toBeDefined();
    expect(numberCheck?.test('abc1')).toBe(true);
  });

  it('special char check should pass with special character', () => {
    const checks = getPasswordChecks();
    const specialCheck = checks.find((c) => c.label.includes('special'));
    expect(specialCheck).toBeDefined();
    expect(specialCheck?.test('abc!')).toBe(true);
  });

  it('special char check should fail without special character', () => {
    const checks = getPasswordChecks();
    const specialCheck = checks.find((c) => c.label.includes('special'));
    expect(specialCheck).toBeDefined();
    expect(specialCheck?.test('abcdef')).toBe(false);
  });
});
