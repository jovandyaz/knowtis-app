import { useEffect, useRef, useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';

import { AudioWaveform } from './AudioWaveform';
import { RecordingModal } from './RecordingModal';
import { RecordingTimer } from './RecordingTimer';
import { VoiceButton } from './VoiceButton';

const meta: Meta<typeof RecordingModal> = {
  title: 'Components/RecordingModal',
  component: RecordingModal,
  tags: ['autodocs'],
  argTypes: {
    open: {
      control: 'boolean',
    },
    preventClose: {
      control: 'boolean',
    },
  },
};

export default meta;
type Story = StoryObj<typeof RecordingModal>;

function RecordingStateDemo() {
  const [open, setOpen] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [mockData, setMockData] = useState<Uint8Array<ArrayBuffer>>(
    () => new Uint8Array(64)
  );
  const mockInterval = useRef<ReturnType<typeof setInterval>>(undefined);
  const timerInterval = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => {
    if (open) {
      mockInterval.current = setInterval(() => {
        const data = new Uint8Array(64);
        for (let i = 0; i < data.length; i++) {
          data[i] = Math.floor(Math.random() * 200 + 30);
        }
        setMockData(data);
      }, 80);

      timerInterval.current = setInterval(() => {
        setElapsed((prev) => Math.min(prev + 1, 300));
      }, 1000);
    }

    return () => {
      clearInterval(mockInterval.current);
      clearInterval(timerInterval.current);
    };
  }, [open]);

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          setElapsed(0);
          setOpen(true);
        }}
        className="rounded-md bg-(--primary) px-4 py-2 text-(--primary-foreground)"
      >
        Open Recording Modal
      </button>

      <RecordingModal
        open={open}
        onOpenChange={setOpen}
        title="Recording"
        preventClose
      >
        <div className="flex flex-col items-center gap-6 py-4">
          <h3 className="text-lg font-semibold text-(--foreground)">
            Recording...
          </h3>
          <AudioWaveform mockData={mockData} className="w-full" />
          <RecordingTimer elapsed={elapsed} maxDuration={300} isRecording />
          <VoiceButton state="listening" size="xl" />
        </div>
      </RecordingModal>
    </div>
  );
}

export const RecordingState: Story = {
  render: () => <RecordingStateDemo />,
};
