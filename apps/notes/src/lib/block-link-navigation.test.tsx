import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BLOCK_LINK_NAVIGATION } from './block-link-navigation';

const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';

function renderRegion() {
  render(<div data-testid="region" {...BLOCK_LINK_NAVIGATION} />);
  return screen.getByTestId('region');
}

describe('BLOCK_LINK_NAVIGATION', () => {
  it('prevents a click on an HTML link', () => {
    const region = renderRegion();
    const link = document.createElement('a');
    link.setAttribute('href', 'https://evil.test/?q=1');
    region.append(link);
    expect(fireEvent.click(link)).toBe(false);
  });

  it('prevents a click inside an SVG link that carries only xlink:href', () => {
    const region = renderRegion();
    const svg = document.createElementNS(SVG_NS, 'svg');
    const link = document.createElementNS(SVG_NS, 'a');
    link.setAttributeNS(XLINK_NS, 'xlink:href', 'https://evil.test/?q=1');
    const label = document.createElementNS(SVG_NS, 'text');
    link.append(label);
    svg.append(link);
    region.append(svg);
    expect(fireEvent.click(label)).toBe(false);
  });

  it('leaves a click outside any link alone', () => {
    const region = renderRegion();
    const paragraph = document.createElement('p');
    region.append(paragraph);
    expect(fireEvent.click(paragraph)).toBe(true);
  });
});
