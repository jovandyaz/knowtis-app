import { useEffect, useRef } from 'react';

const PREFETCH_MARGIN = '400px';

interface InfiniteScrollSentinelOptions {
  hasMore: boolean;
  isLoading: boolean;
  onLoadMore: () => void;
}

/**
 * Returns a ref for the element that, once scrolled near, requests the next page.
 * The observer is torn down while a fetch is in flight so one sentinel cannot queue several.
 */
export function useInfiniteScrollSentinel({
  hasMore,
  isLoading,
  onLoadMore,
}: InfiniteScrollSentinelOptions) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef(onLoadMore);

  useEffect(() => {
    loadMoreRef.current = onLoadMore;
  }, [onLoadMore]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore || isLoading) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          loadMoreRef.current();
        }
      },
      { rootMargin: PREFETCH_MARGIN }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, isLoading]);

  return sentinelRef;
}
