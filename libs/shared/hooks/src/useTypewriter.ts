import { useEffect, useRef, useState } from 'react';

interface UseTypewriterOptions {
  texts: string[];
  speed?: number;
  deleteSpeed?: number;
  waitTime?: number;
  loop?: boolean;
}

const Phase = {
  TYPING: 'typing',
  WAITING: 'waiting',
  DELETING: 'deleting',
} as const;

type Phase = (typeof Phase)[keyof typeof Phase];

const CURSOR = '|';

export function useTypewriter({
  texts,
  speed = 60,
  deleteSpeed = 35,
  waitTime = 2000,
  loop = true,
}: UseTypewriterOptions): string {
  const [displayText, setDisplayText] = useState('');

  const textsRef = useRef(texts);
  const speedRef = useRef(speed);
  const deleteSpeedRef = useRef(deleteSpeed);
  const waitTimeRef = useRef(waitTime);
  const loopRef = useRef(loop);

  textsRef.current = texts;
  speedRef.current = speed;
  deleteSpeedRef.current = deleteSpeed;
  waitTimeRef.current = waitTime;
  loopRef.current = loop;

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    let phase: Phase = Phase.TYPING;
    let textIndex = 0;
    let charIndex = 0;

    function tick() {
      const currentTexts = textsRef.current;
      const currentText = currentTexts[textIndex];
      if (!currentText) {return;}

      if (phase === Phase.TYPING) {
        if (charIndex < currentText.length) {
          charIndex++;
          setDisplayText(currentText.slice(0, charIndex) + CURSOR);
          timeoutId = setTimeout(tick, speedRef.current);
          return;
        }
        setDisplayText(currentText);
        if (currentTexts.length === 1) {return;}
        phase = Phase.WAITING;
        timeoutId = setTimeout(tick, waitTimeRef.current);
        return;
      }

      if (phase === Phase.WAITING) {
        phase = Phase.DELETING;
        timeoutId = setTimeout(tick, deleteSpeedRef.current);
        return;
      }

      if (charIndex > 0) {
        charIndex--;
        setDisplayText(currentText.slice(0, charIndex) + CURSOR);
        timeoutId = setTimeout(tick, deleteSpeedRef.current);
        return;
      }

      const nextIndex = textIndex + 1;
      if (nextIndex < currentTexts.length) {
        textIndex = nextIndex;
      } else if (loopRef.current) {
        textIndex = 0;
      } else {
        return;
      }
      phase = Phase.TYPING;
      timeoutId = setTimeout(tick, speedRef.current);
    }

    setDisplayText(CURSOR);
    timeoutId = setTimeout(tick, speedRef.current);

    return () => clearTimeout(timeoutId);
  }, [texts.length]);

  return displayText;
}
