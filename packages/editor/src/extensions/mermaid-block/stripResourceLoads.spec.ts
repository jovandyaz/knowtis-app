import mermaid from 'mermaid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { stripResourceLoads } from './stripResourceLoads';

const FOREIGN = 'https://x.invalid/p.png';

function parse(markup: string): DocumentFragment {
  const template = document.createElement('template');
  template.innerHTML = markup;
  return template.content;
}

function svg(body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" id="d">${body}</svg>`;
}

function attributesOf(
  markup: string,
  selector: string
): Record<string, string> {
  const element = parse(markup).querySelector(selector);
  return Object.fromEntries(
    [...(element?.attributes ?? [])].map((attr) => [attr.name, attr.value])
  );
}

function styleTexts(markup: string): string[] {
  return [...parse(markup).querySelectorAll('style')].map(
    (style) => style.textContent ?? ''
  );
}

function outline(markup: string): string[] {
  return [...parse(markup).querySelectorAll('*')].map(
    (element) =>
      `${element.localName}[${[...element.attributes]
        .map((attr) => attr.name)
        .sort()
        .join(',')}]`
  );
}

describe('stripResourceLoads', () => {
  it.each([
    ['img', `<img src="${FOREIGN}" alt="a">`, { alt: 'a' }],
    ['img', `<img srcset="${FOREIGN} 2x" alt="a">`, { alt: 'a' }],
    ['source', `<picture><source srcset="${FOREIGN}"></picture>`, {}],
    ['video', `<video poster="${FOREIGN}"></video>`, {}],
    ['input', `<input type="image" src="${FOREIGN}">`, { type: 'image' }],
    ['table', `<table background="${FOREIGN}"></table>`, {}],
  ])('drops what makes a label %s load', (tag, label, kept) => {
    const out = stripResourceLoads(
      svg(`<foreignObject><div>${label}</div></foreignObject>`)
    );

    expect(attributesOf(out, tag)).toEqual(kept);
  });

  it.each([
    ['image', `<image href="${FOREIGN}"></image>`],
    ['image', `<image xlink:href="${FOREIGN}"></image>`],
    [
      'feImage',
      `<filter id="f"><feImage href="${FOREIGN}"></feImage></filter>`,
    ],
    ['use', `<use href="https://x.invalid/s.svg#a"></use>`],
    ['pattern', `<pattern href="https://x.invalid/s.svg#p"></pattern>`],
    ['image', '<image href="/t/p.png"></image>'],
  ])('drops an off-document reference on %s', (tag, markup) => {
    const out = stripResourceLoads(svg(markup));

    expect(attributesOf(out, tag)).toEqual({});
  });

  it('keeps fragment references and inline image data', () => {
    const icon = 'data:image/png;base64,iVBORw0KGgo=';
    const out = stripResourceLoads(
      svg(
        `<use href="#glyph"></use><image xlink:href="${icon}"></image><path marker-end="url(#d_pointEnd)" fill="url('#d-gradient')"></path>`
      )
    );

    expect(attributesOf(out, 'use')).toEqual({ href: '#glyph' });
    expect(attributesOf(out, 'image')).toEqual({ 'xlink:href': icon });
    expect(attributesOf(out, 'path')).toEqual({
      'marker-end': 'url(#d_pointEnd)',
      fill: "url('#d-gradient')",
    });
  });

  it('keeps links, which navigate on a click instead of loading', () => {
    const out = stripResourceLoads(
      svg('<a href="https://example.com/doc"><text>doc</text></a>')
    );

    expect(attributesOf(out, 'a')).toEqual({
      href: 'https://example.com/doc',
    });
  });

  it.each([
    ['style', `background-image:url(${FOREIGN})`],
    ['style', `background:URL("${FOREIGN}")`],
    ['style', `cursor:image-set("${FOREIGN}" 1x), auto`],
    ['style', `background:u\\72l(${FOREIGN})`],
    ['style', 'background-image:url(t/p.png)'],
    ['fill', 'url(https://x.invalid/s.svg#p)'],
    ['filter', "url('https://x.invalid/s.svg#f')"],
    ['mask', 'url( https://x.invalid/s.svg#m )'],
  ])('drops a %s whose css loads a resource: %s', (attribute, value) => {
    const element = parse(svg('<rect></rect>')).querySelector('rect');
    element?.setAttribute(attribute, value);
    const markup = element?.closest('svg')?.outerHTML ?? '';

    const out = stripResourceLoads(markup);

    expect(attributesOf(out, 'rect')).toEqual({});
  });

  it('keeps a style attribute that loads nothing', () => {
    const out = stripResourceLoads(
      svg('<rect style="fill:#f9f;stroke:#333;stroke-width:4px"></rect>')
    );

    expect(attributesOf(out, 'rect')).toEqual({
      style: 'fill:#f9f;stroke:#333;stroke-width:4px',
    });
  });

  it.each([
    `#d .node rect{fill:url(${FOREIGN});}`,
    '@import "https://x.invalid/s.css";',
    `#d span{background:image-set("${FOREIGN}" 1x);}`,
    `#d span{background:\\75 rl(${FOREIGN});}`,
    `#d span{background:url(data:image/png;base64,AAAA);}`,
  ])('drops a <style> whose css loads a resource: %s', (css) => {
    const out = stripResourceLoads(svg(`<style>${css}</style><g></g>`));

    expect(styleTexts(out)).toEqual([]);
  });

  it('keeps a <style> whose only urls are fragment references', () => {
    const css =
      '#d .node rect{fill:url(#d-gradient);}#d .edge{marker-end:url( "#d_pointEnd" );}';

    const out = stripResourceLoads(svg(`<style>${css}</style>`));

    expect(styleTexts(out)).toEqual([css]);
  });

  describe('on what mermaid draws for an ordinary diagram', () => {
    const BENIGN_DIAGRAMS: Record<string, string> = {
      flowchart:
        'flowchart LR\n  A[Start] --> B{Ok?}\n  B -->|yes| C((End))\n  B -.-> D>"`**bold** label`"]\n  subgraph S [Group]\n    D\n  end\n  style C fill:#f9f,stroke:#333\n  classDef hot fill:#fdd\n  class B hot',
      sequence:
        'sequenceDiagram\n  actor U\n  participant D as Database\n  U->>D: query\n  Note over U,D: a note\n  loop retry\n    D-->>U: rows\n  end',
      class:
        'classDiagram\n  Animal <|-- Duck\n  class Duck{\n    +String beak\n    +swim()\n  }',
      state:
        'stateDiagram-v2\n  [*] --> Idle\n  Idle --> Busy: go\n  state Busy {\n    [*] --> Working\n  }\n  Busy --> [*]',
      er: 'erDiagram\n  CUSTOMER ||--o{ ORDER : places\n  ORDER {\n    string id PK\n  }',
      gantt:
        'gantt\n  title Plan\n  dateFormat YYYY-MM-DD\n  section A\n  Task :a1, 2024-01-01, 3d\n  Next :after a1, 2d',
      pie: 'pie title Pets\n  "Dogs" : 386\n  "Cats" : 85',
      journey:
        'journey\n  title Day\n  section Work\n    Code: 5: Me\n    Review: 3: Me, You',
      timeline: 'timeline\n  title History\n  2020 : Start\n  2021 : Grow',
      c4: 'C4Context\n  Person(user, "User", "A person")\n  System(app, "App")\n  Rel(user, app, "Uses")',
    };

    beforeAll(() => {
      Object.assign(SVGElement.prototype, {
        getBBox: () => ({ x: 0, y: 0, width: 40, height: 20 }),
        getComputedTextLength: () => 40,
      });
      mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
    });

    afterAll(() => {
      Reflect.deleteProperty(SVGElement.prototype, 'getBBox');
      Reflect.deleteProperty(SVGElement.prototype, 'getComputedTextLength');
    });

    it.each(Object.entries(BENIGN_DIAGRAMS))(
      'removes nothing from a %s',
      async (type, source) => {
        const { svg: drawn } = await mermaid.render(`benign-${type}`, source);

        expect(outline(stripResourceLoads(drawn))).toEqual(outline(drawn));
        expect(styleTexts(stripResourceLoads(drawn))).toEqual(
          styleTexts(drawn)
        );
      }
    );
  });
});
