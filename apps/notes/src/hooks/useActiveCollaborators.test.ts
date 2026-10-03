import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  applyAwarenessUpdate,
  Awareness,
  encodeAwarenessUpdate,
} from 'y-protocols/awareness';
import * as Y from 'yjs';

import { useActiveCollaborators } from './useActiveCollaborators';

const HERON = { name: 'Quiet Heron', color: '#22d3ee' };
const OTTER = { name: 'Brave Otter', color: '#4ade80' };
const CURSOR = { anchor: 1, head: 1 };

const owned: Array<{ destroy: () => void }> = [];

function awarenessOnNewDoc(): Awareness {
  const doc = new Y.Doc();
  const awareness = new Awareness(doc);
  owned.push(awareness, doc);
  return awareness;
}

function join(awareness: Awareness, state: Record<string, unknown>): number {
  const peer = awarenessOnNewDoc();
  peer.setLocalState(state);
  applyAwarenessUpdate(
    awareness,
    encodeAwarenessUpdate(peer, [peer.clientID]),
    'remote'
  );
  return peer.clientID;
}

afterEach(() => {
  owned.splice(0).forEach((resource) => resource.destroy());
});

describe('useActiveCollaborators', () => {
  it('lists the remote users with a cursor, never the local one', () => {
    const awareness = awarenessOnNewDoc();
    awareness.setLocalState({ user: OTTER, cursor: CURSOR });
    const heron = join(awareness, { user: HERON, cursor: CURSOR });
    join(awareness, { user: { name: 'Idle Lynx', color: '#f87171' } });

    const { result } = renderHook(() => useActiveCollaborators(awareness));

    expect(result.current).toEqual([{ id: String(heron), ...HERON }]);
  });

  it('follows users joining after it subscribed', () => {
    const awareness = awarenessOnNewDoc();
    const { result } = renderHook(() => useActiveCollaborators(awareness));

    let heron = 0;
    act(() => {
      heron = join(awareness, { user: HERON, cursor: CURSOR });
    });

    expect(result.current).toEqual([{ id: String(heron), ...HERON }]);
  });

  it('switches to the users of a new awareness and stops following the old one', () => {
    const previous = awarenessOnNewDoc();
    join(previous, { user: OTTER, cursor: CURSOR });
    const { result, rerender } = renderHook(
      ({ awareness }: { awareness: Awareness }) =>
        useActiveCollaborators(awareness),
      { initialProps: { awareness: previous } }
    );
    const next = awarenessOnNewDoc();
    const heron = join(next, { user: HERON, cursor: CURSOR });

    rerender({ awareness: next });
    act(() => {
      join(previous, { user: OTTER, cursor: { anchor: 2, head: 2 } });
    });

    expect(result.current).toEqual([{ id: String(heron), ...HERON }]);
  });

  it('lists no one without an awareness', () => {
    const awareness = awarenessOnNewDoc();
    join(awareness, { user: HERON, cursor: CURSOR });
    const initialProps: { current: Awareness | null } = { current: awareness };
    const { result, rerender } = renderHook(
      ({ current }) => useActiveCollaborators(current),
      { initialProps }
    );
    expect(result.current).toHaveLength(1);

    rerender({ current: null });

    expect(result.current).toEqual([]);
  });
});
