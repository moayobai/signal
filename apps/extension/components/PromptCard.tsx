import { useEffect, useRef, useState } from 'react';
import type { SignalPrompt } from '@signal/types';

interface PromptCardProps {
  prompt: SignalPrompt;
  onDismiss?: () => void;
}

const typeLabels: Record<SignalPrompt['type'], string> = {
  ASK:     'ASK · ADVANCE',
  CLOSE:   'CLOSE · SIGNAL',
  WARN:    'WARN · DANGER',
  REFRAME: 'REFRAME · POSITION',
  BODY:    'BODY LANG · NUDGE',
  SILENCE: 'SILENCE · RE-ENGAGE',
  IDLE:    'SIGNAL · LISTENING',
};

const typeColors: Record<SignalPrompt['type'], string> = {
  ASK:     'text-[--accent]',
  CLOSE:   'text-[--success]',
  WARN:    'text-[--danger]',
  REFRAME: 'text-[--accent]',
  BODY:    'text-[#b06000]',
  SILENCE: 'text-[--text-tertiary]',
  IDLE:    'text-[--text-tertiary]',
};

export function PromptCard({ prompt, onDismiss }: PromptCardProps) {
  const [visible, setVisible] = useState(true);
  const [displayedPrompt, setDisplayedPrompt] = useState(prompt);
  const prevTimestamp = useRef(prompt.timestamp);

  useEffect(() => {
    if (prompt.timestamp === prevTimestamp.current) return;
    prevTimestamp.current = prompt.timestamp;
    setVisible(false);
    const timer = setTimeout(() => {
      setDisplayedPrompt(prompt);
      setVisible(true);
    }, 140);
    return () => clearTimeout(timer);
  }, [prompt]);

  const isNudge = displayedPrompt.isNudge;

  return (
    <div className="px-4 pb-4 pt-3">
      <div
        className={`text-[9px] font-semibold tracking-[0.1em] uppercase mb-1.5 ${typeColors[displayedPrompt.type]}`}
        style={{ opacity: 0.6 + displayedPrompt.confidence * 0.4 }}
      >
        {typeLabels[displayedPrompt.type]}
      </div>
      <div
        className={[
          'rounded-[10px] px-3 py-2.5',
          'bg-[--accent-subtle] border border-[rgba(0,113,227,0.18)]',
          'transition-[opacity,transform] duration-[280ms] ease-out',
          isNudge ? 'border-[rgba(255,159,10,0.5)] bg-[rgba(255,159,10,0.06)] animate-[border-pulse_1.2s_ease-in-out_infinite]' : '',
          visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1.5',
        ].filter(Boolean).join(' ')}
      >
        <p className="text-[11.5px] text-[--text-primary] leading-[1.55]">
          {displayedPrompt.text}
        </p>
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="mt-1.5 text-[9px] text-[--text-tertiary] hover:text-[--text-secondary] transition-colors w-full text-right"
        >
          swipe to dismiss →
        </button>
      )}
    </div>
  );
}
