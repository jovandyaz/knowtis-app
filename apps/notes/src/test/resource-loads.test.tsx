import { render, screen } from '@testing-library/react';
import { defaultRehypePlugins, Streamdown } from 'streamdown';
import { afterEach, describe, expect, it } from 'vitest';

import {
  CANARY_HOST,
  HOSTILE_HTML,
  HOSTILE_LINKS_HTML,
  HOSTILE_LINKS_MARKDOWN,
  HOSTILE_MARKDOWN,
  STORED_IMAGE_URL,
} from './hostile-markdown';
import { plainClickOutcome } from './link-navigation';
import {
  foreignLoads,
  recordResourceLoads,
  resourceLoadsOf,
} from './resource-loads';

function injectRaw(html: string): HTMLElement {
  const region = document.createElement('div');
  region.innerHTML = html;
  document.body.append(region);
  return region;
}

function renderUndefended(markdown: string) {
  return render(
    <Streamdown
      mode="static"
      rehypePlugins={[defaultRehypePlugins['raw']]}
      urlTransform={(url) => url}
      linkSafety={{ enabled: false }}
    >
      {markdown}
    </Streamdown>
  );
}

describe('the hostile render corpus', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it.each(HOSTILE_HTML.map(({ name, source }) => [name, source]))(
    'loads something when %s reaches the page unsanitized',
    async (_, source) => {
      const loads = await recordResourceLoads(() => {
        injectRaw(source);
      });

      expect(foreignLoads(loads)).not.toEqual([]);
    }
  );

  it.each(
    HOSTILE_MARKDOWN.filter((payload) => !HOSTILE_HTML.includes(payload)).map(
      ({ name, source }) => [name, source]
    )
  )(
    'loads something when %s is rendered by Streamdown without the app defenses',
    async (_, source) => {
      const loads = await recordResourceLoads(async () => {
        renderUndefended(source);
        await screen.findByRole('img');
      });

      expect(foreignLoads(loads)).not.toEqual([]);
    }
  );

  it.each(HOSTILE_LINKS_HTML.map(({ name, source }) => [name, source]))(
    'navigates on a plain click when %s reaches the page unsanitized',
    (_, source) => {
      const region = injectRaw(source);

      expect(plainClickOutcome(region).navigations).not.toEqual([]);
    }
  );

  it.each(
    HOSTILE_LINKS_MARKDOWN.filter(
      (payload) => !HOSTILE_LINKS_HTML.includes(payload)
    ).map(({ name, source }) => [name, source])
  )(
    'navigates on a plain click when %s is rendered by Streamdown without the app defenses',
    async (_, source) => {
      const { container } = renderUndefended(source);
      await screen.findByRole('link');

      expect(plainClickOutcome(container).navigations).not.toEqual([]);
    }
  );
});

describe('recordResourceLoads', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('records an image built off the document, as Mermaid builds its image shapes', async () => {
    const url = `https://${CANARY_HOST}/detached.png`;

    const loads = await recordResourceLoads(() => {
      new Image().src = url;
    });

    expect(loads).toContainEqual({ via: 'img[src]', url });
  });

  it('records an element attached and detached again before the action settles', async () => {
    const url = `https://${CANARY_HOST}/transient.png`;

    const loads = await recordResourceLoads(async () => {
      const region = injectRaw(`<style>p { background: url(${url}) }</style>`);
      await Promise.resolve();
      region.remove();
    });

    expect(loads).toContainEqual({ via: '<style>', url });
  });

  it('records fetch and window.open', async () => {
    const fetched = 'data:,fetched';
    const opened = `https://${CANARY_HOST}/opened`;

    const loads = await recordResourceLoads(async () => {
      await fetch(fetched).catch(() => undefined);
      window.open(opened);
    });

    expect(loads).toEqual(
      expect.arrayContaining([
        { via: 'fetch', url: fetched },
        { via: 'window.open', url: opened },
      ])
    );
  });

  it('lets an image from the app blob store through', async () => {
    const loads = await recordResourceLoads(() => {
      injectRaw(`<img src="${STORED_IMAGE_URL}" alt="kept">`);
    });

    expect(loads).toContainEqual({ via: 'img[src]', url: STORED_IMAGE_URL });
    expect(foreignLoads(loads)).toEqual([]);
  });

  it('records a CSS url() whose escapes name no valid code point', () => {
    const url = 'https://canary.invalid/x\\ffffff\\d800\\0';
    const element = document.createElement('div');
    element.setAttribute('style', `background: url(${url})`);

    expect(resourceLoadsOf(element)).toEqual([
      { via: 'div[style]', url: 'https://canary.invalid/x���' },
    ]);
  });

  it('ignores a same-document fragment reference', async () => {
    const loads = await recordResourceLoads(() => {
      injectRaw('<svg><use href="#a" /><rect fill="url(#gradient)" /></svg>');
    });

    expect(loads).toEqual([]);
  });
});
