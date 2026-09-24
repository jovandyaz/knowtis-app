import { v5 as uuidv5, validate, version } from 'uuid';
import { describe, expect, it } from 'vitest';

import {
  conversationIdForTurn,
  KNOWTIS_CONVERSATION_NAMESPACE,
} from './turn-identity';

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER_USER = '22222222-2222-4222-8222-222222222222';
const TURN = '33333333-3333-4333-8333-333333333333';
const OTHER_TURN = '44444444-4444-4444-8444-444444444444';

describe('conversationIdForTurn', () => {
  it('derives a v5 uuid from the user and the turn under the Knowtis namespace', () => {
    const id = conversationIdForTurn(USER, TURN);

    expect(id).toBe(uuidv5(`${USER}:${TURN}`, KNOWTIS_CONVERSATION_NAMESPACE));
    expect(validate(id)).toBe(true);
    expect(version(id)).toBe(5);
  });

  it('gives a resend of the same turn the same conversation', () => {
    expect(conversationIdForTurn(USER, TURN)).toBe(
      conversationIdForTurn(USER, TURN)
    );
  });

  it('gives another turn or another user a different conversation', () => {
    const id = conversationIdForTurn(USER, TURN);

    expect(conversationIdForTurn(USER, OTHER_TURN)).not.toBe(id);
    expect(conversationIdForTurn(OTHER_USER, TURN)).not.toBe(id);
  });

  it('keeps the namespace a valid uuid', () => {
    expect(validate(KNOWTIS_CONVERSATION_NAMESPACE)).toBe(true);
  });
});
