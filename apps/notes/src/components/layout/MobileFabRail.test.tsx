import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MOBILE_FAB_SLOT_ID, MobileFabRail } from './MobileFabRail';

const currentPathname = vi.fn<() => string>();

vi.mock('@tanstack/react-router', () => ({
  useLocation: () => ({ pathname: currentPathname() }),
}));

function renderRail() {
  return render(
    <MobileFabRail>
      <button type="button">compose</button>
    </MobileFabRail>
  );
}

describe('MobileFabRail', () => {
  beforeEach(() => {
    currentPathname.mockReturnValue('/notes');
  });

  it('floats its actions and offers the slot route-level ones portal into', () => {
    renderRail();

    expect(screen.getByRole('button', { name: 'compose' })).toBeInTheDocument();
    expect(document.getElementById(MOBILE_FAB_SLOT_ID)).toBeInTheDocument();
  });

  it('renders nothing on the study session route', () => {
    currentPathname.mockReturnValue('/study');

    const { container } = renderRail();

    expect(container).toBeEmptyDOMElement();
    expect(document.getElementById(MOBILE_FAB_SLOT_ID)).toBeNull();
  });
});
