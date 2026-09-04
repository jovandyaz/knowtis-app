const NON_BREAKING_SPACE = /\u00a0/g;

/** True when the HTML renders at least one visible, non-whitespace character. */
export function hasMeaningfulText(html: string): boolean {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  return (
    (parsed.body.textContent ?? '').replace(NON_BREAKING_SPACE, ' ').trim()
      .length > 0
  );
}
