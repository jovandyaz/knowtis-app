const LOADING_ATTRIBUTES = new Set(['src', 'srcset', 'poster', 'background']);
const REFERENCE_ATTRIBUTES = new Set(['href', 'xlink:href']);
const LINK_ELEMENT = 'a';
const IMAGE_ELEMENT = 'image';
const STYLE_ELEMENT = 'style';
const FRAGMENT_PREFIX = '#';
const INLINE_IMAGE_PREFIX = 'data:image/';

const CSS_ESCAPE = /\\(?:([\da-f]{1,6})\s?|([\s\S]))/gi;
const CSS_URL_TARGET = /\b(?:url|src)\s*\(\s*['"]?\s*(.?)/g;
const CSS_IMAGE_FUNCTION = /\bimage(?:-set)?\s*\(/;
const CSS_IMPORT = '@import';
const MAX_CODE_POINT = 0x10ffff;
const REPLACEMENT_CHARACTER = '�';

function decodeCssEscapes(css: string): string {
  return css.replace(CSS_ESCAPE, (_, hex: string | undefined, char: string) => {
    if (hex === undefined) {
      return char;
    }
    const codePoint = parseInt(hex, 16);
    return codePoint > 0 && codePoint <= MAX_CODE_POINT
      ? String.fromCodePoint(codePoint)
      : REPLACEMENT_CHARACTER;
  });
}

function cssLoadsResource(css: string): boolean {
  const normalized = decodeCssEscapes(css).toLowerCase();
  if (normalized.includes(CSS_IMPORT) || CSS_IMAGE_FUNCTION.test(normalized)) {
    return true;
  }
  return [...normalized.matchAll(CSS_URL_TARGET)].some(
    ([, target]) => target !== FRAGMENT_PREFIX
  );
}

function referenceLoadsResource(element: Element, value: string): boolean {
  if (element.localName === LINK_ELEMENT) {
    return false;
  }
  const target = value.trim().toLowerCase();
  const isInlineImage =
    element.localName === IMAGE_ELEMENT &&
    target.startsWith(INLINE_IMAGE_PREFIX);
  return !target.startsWith(FRAGMENT_PREFIX) && !isInlineImage;
}

function loadsResource(element: Element, attr: Attr): boolean {
  const name = attr.name.toLowerCase();
  if (LOADING_ATTRIBUTES.has(name)) {
    return true;
  }
  if (REFERENCE_ATTRIBUTES.has(name)) {
    return referenceLoadsResource(element, attr.value);
  }
  return cssLoadsResource(attr.value);
}

/**
 * Removes everything in rendered diagram markup that would make the browser
 * fetch a resource once injected: loading attributes, references to other
 * documents, and CSS (attributes or `<style>` elements) whose urls are not
 * `#fragment` references. Links are kept; they only navigate on a click.
 */
export function stripResourceLoads(markup: string): string {
  const template = document.createElement('template');
  template.innerHTML = markup;
  for (const element of template.content.querySelectorAll('*')) {
    if (
      element.localName === STYLE_ELEMENT &&
      cssLoadsResource(element.textContent ?? '')
    ) {
      element.remove();
      continue;
    }
    for (const attr of [...element.attributes]) {
      if (loadsResource(element, attr)) {
        element.removeAttributeNode(attr);
      }
    }
  }
  return template.innerHTML;
}
