import { describe, expect, it } from 'vitest';

import { learnToneButton } from './learn-tone-button';

describe('learnToneButton', () => {
  it('paints a correct button with the AA-contrast text token', () => {
    expect(learnToneButton({ tone: 'correct' }).split(' ')).toContain(
      'text-learn-correct-text'
    );
  });

  it('keeps the tone on hover, where a ghost host would repaint the text', () => {
    expect(learnToneButton({ tone: 'incorrect' }).split(' ')).toContain(
      'hover:text-learn-incorrect-text'
    );
  });
});
