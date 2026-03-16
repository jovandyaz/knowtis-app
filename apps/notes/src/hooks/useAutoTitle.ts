import { useCallback, useEffect, useRef, useState } from 'react';

import { normalizeWhitespace, stripHtmlTags } from '@/lib/text';

const AUTO_TITLE_MAX_LENGTH = 50;
const AUTO_TITLE_MAX_WORDS = 8;

interface UseAutoTitleOptions {
  initialTitle: string;
  defaultTitle: string;
  onAutoTitleChange: (newTitle: string) => void;
}

function extractFirstLine(html: string): string {
  const firstBlock = html.split(/<\/(?:p|h[1-6]|li|div|blockquote)>/i)[0] ?? '';
  const text = normalizeWhitespace(stripHtmlTags(firstBlock));

  if (!text) {
    return '';
  }

  const words = text.split(' ').slice(0, AUTO_TITLE_MAX_WORDS).join(' ');
  if (words.length <= AUTO_TITLE_MAX_LENGTH) {
    return words;
  }

  const truncated = words.slice(0, AUTO_TITLE_MAX_LENGTH);
  const lastSpace = truncated.lastIndexOf(' ');
  return lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated;
}

export function useAutoTitle({
  initialTitle,
  defaultTitle,
  onAutoTitleChange,
}: UseAutoTitleOptions) {
  const [title, setTitle] = useState(initialTitle);
  const isTitleManuallyEditedRef = useRef(initialTitle !== defaultTitle);
  const onAutoTitleChangeRef = useRef(onAutoTitleChange);
  useEffect(() => {
    onAutoTitleChangeRef.current = onAutoTitleChange;
  });

  const handleTitleChange = useCallback((newTitle: string) => {
    isTitleManuallyEditedRef.current = true;
    setTitle(newTitle);
  }, []);

  const deriveAutoTitle = useCallback(
    (htmlContent: string) => {
      if (isTitleManuallyEditedRef.current) {
        return;
      }

      const derived = extractFirstLine(htmlContent) || defaultTitle;

      setTitle(derived);
      onAutoTitleChangeRef.current(derived);
    },
    [defaultTitle]
  );

  return { title, handleTitleChange, deriveAutoTitle };
}
