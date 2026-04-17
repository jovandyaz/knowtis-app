import { describe, expect, it } from 'vitest';

import { isTrivialHtml } from './trivial-html';

describe('isTrivialHtml', () => {
  it.each([
    [null],
    [undefined],
    [''],
    ['   '],
    ['<p></p>'],
    ['<p><br></p>'],
    ['<p><br /></p>'],
    ['  <p>  </p>  '],
    ['<h1></h1>'],
    ['<h2></h2>'],
  ])('returns true for trivial HTML: %j', (input) => {
    expect(isTrivialHtml(input)).toBe(true);
  });

  it.each([
    ['<p>hi</p>'],
    ['<h1>Title</h1>'],
    ['<p><strong>bold</strong></p>'],
    ['<p></p><p></p>'],
    ['<ul><li>item</li></ul>'],
    ['<pre><code>const x = 1</code></pre>'],
  ])('returns false for non-trivial HTML: %j', (input) => {
    expect(isTrivialHtml(input)).toBe(false);
  });
});
