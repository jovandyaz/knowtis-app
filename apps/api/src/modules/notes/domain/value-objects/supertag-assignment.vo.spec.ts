import { describe, expect, it } from 'vitest';

import { SupertagAssignment } from './supertag-assignment.vo';

describe('SupertagAssignment', () => {
  it('should reject a type outside the catalog', () => {
    expect(SupertagAssignment.create('wizard', {}).isErr()).toBe(true);
  });

  it('should reject a field the type does not declare', () => {
    const result = SupertagAssignment.create('person', {
      name: 'Ada',
      salary: 100,
    });

    expect(result.isErr()).toBe(true);
  });

  it.each([[{}], [{ name: null }], [{ name: '' }], [{ name: '   ' }]])(
    'should refuse to persist person with %j because name is required',
    (fields) => {
      expect(SupertagAssignment.create('person', fields).isErr()).toBe(true);
    }
  );

  it('should accept a type once its required field is filled', () => {
    const result = SupertagAssignment.create('person', { name: 'Ada' });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().value.supertag).toBe('person');
  });

  it('should fill every declared field with null rather than leaving it absent', () => {
    const value = SupertagAssignment.create('person', {
      name: 'Ada',
    })._unsafeUnwrap().value;

    expect(value.supertagFields).toEqual({
      name: 'Ada',
      role: null,
      contact: null,
    });
  });

  it('should reject a value longer than the descriptor allows', () => {
    const result = SupertagAssignment.create('person', {
      name: 'a'.repeat(121),
    });

    expect(result.isErr()).toBe(true);
  });

  it('should keep a numeric field as a number', () => {
    const value = SupertagAssignment.create('book', {
      title: 'SICP',
      rating: 5,
    })._unsafeUnwrap().value;

    expect(value.supertagFields?.['rating']).toBe(5);
  });

  it('should reject a value that is neither text nor a number', () => {
    const result = SupertagAssignment.create('person', {
      name: { first: 'Ada' },
    });

    expect(result.isErr()).toBe(true);
  });

  it('should reject text in a field the catalog declares numeric', () => {
    const result = SupertagAssignment.create('book', {
      title: 'SICP',
      rating: 'five',
    });

    expect(result.isErr()).toBe(true);
  });

  it('should store a blank optional value as null', () => {
    const value = SupertagAssignment.create('book', {
      title: 'SICP',
      author: '   ',
    })._unsafeUnwrap().value;

    expect(value.supertagFields?.['author']).toBeNull();
  });

  it('should clear the fields along with the type', () => {
    expect(SupertagAssignment.clear().value).toEqual({
      supertag: null,
      supertagFields: null,
    });
  });
});
