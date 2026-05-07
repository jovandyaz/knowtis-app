import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { GraduationCap, X } from 'lucide-react';

import { Button, Input } from '@knowtis/design-system';

const MIN_TOPIC_LENGTH = 2;

interface AIBlockInputFormProps {
  initialTopic: string;
  onSubmit: (topic: string) => void;
  onDiscard: () => void;
}

export function AIBlockInputForm({
  initialTopic,
  onSubmit,
  onDiscard,
}: AIBlockInputFormProps) {
  const { t } = useTranslation('notes');
  const [topicInput, setTopicInput] = useState(initialTopic);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Use requestAnimationFrame to ensure the input is mounted before focusing.
    const handle = requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => cancelAnimationFrame(handle);
  }, []);

  const handleSubmit = () => {
    const topic = topicInput.trim();
    if (topic.length < MIN_TOPIC_LENGTH) {
      return;
    }
    onSubmit(topic);
  };

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-primary">
          <GraduationCap className="h-4 w-4" />
          <span className="text-sm font-medium">{t('ai.aiBlock.title')}</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-foreground"
          onClick={onDiscard}
          aria-label={t('ai.aiBlock.discard')}
          title={t('ai.aiBlock.discard')}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
        className="flex gap-2"
      >
        <Input
          ref={inputRef}
          value={topicInput}
          onChange={(e) => setTopicInput(e.target.value)}
          placeholder={t('ai.aiBlock.placeholder')}
          aria-label={t('ai.aiBlock.title')}
          className="flex-1"
        />
        <Button
          type="submit"
          size="sm"
          disabled={topicInput.trim().length < MIN_TOPIC_LENGTH}
        >
          {t('ai.aiBlock.generate')}
        </Button>
      </form>
    </div>
  );
}
