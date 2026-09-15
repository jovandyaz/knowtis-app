import { describe, expect, it } from 'vitest';

import { ArtifactViewer } from './ArtifactViewer';

describe('ArtifactViewer', () => {
  it('identifies an unsupported artifact without including its content in the error', () => {
    const artifact = {
      id: 'artifact-id',
      type: 'unsupported',
      content: 'Private note contents',
    };
    expect(() => {
      // @ts-expect-error The runtime boundary may receive a type outside the supported union.
      ArtifactViewer({ artifact });
    }).toThrow('Unhandled artifact: unsupported (artifact-id)');
  });
});
