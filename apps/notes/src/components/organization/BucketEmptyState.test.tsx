import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { BucketEmptyState } from './BucketEmptyState';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options && 'bucket' in options
        ? `${key}|${String(options['bucket'])}`
        : key,
  }),
}));

describe('BucketEmptyState', () => {
  it('renders the inbox-specific copy for the inbox bucket', () => {
    render(<BucketEmptyState bucket="inbox" />);

    expect(
      screen.getByText('organization.empty.inboxTitle')
    ).toBeInTheDocument();
    expect(
      screen.getByText('organization.empty.inboxDescription')
    ).toBeInTheDocument();
  });

  it('names the bucket in the copy for a PARA bucket', () => {
    render(<BucketEmptyState bucket="projects" />);

    expect(
      screen.getByText(
        'organization.empty.bucketTitle|organization.buckets.projects'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText('organization.empty.bucketDescription')
    ).toBeInTheDocument();
  });
});
