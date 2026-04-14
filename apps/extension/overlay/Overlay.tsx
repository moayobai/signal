import '../assets/styles/globals.css';
import { useEffect } from 'react';
import { useSignalStore } from './store';
import { createFixture } from '../mock/fixture';
import { GlassPanel } from '../components/GlassPanel';
import { SentimentArc } from '../components/SentimentArc';
import { BodyLangRead } from '../components/BodyLangRead';
import { PromptCard } from '../components/PromptCard';
import { TranscriptFeed } from '../components/TranscriptFeed';

function formatTime(s: number): string {
  const m = Math.floor(s / 60).toString().padStart(2, '0');
  const sec = (s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
}

function IdlePill({ elapsed, status }: { elapsed: number; status: 'nominal' | 'nudge' | 'danger' }) {
  const dotColor = {
    nominal: 'bg-[--success]',
    nudge: 'bg-[--warning]',
    danger: 'bg-[--danger]',
  }[status];

  const label =
    status === 'nudge' ? 'Nudge ready'
    : status === 'danger' ? 'Off track'
    : `SIGNAL · ${formatTime(elapsed)}`;

  return (
    <GlassPanel variant="pill">
      <div className={`w-1.5 h-1.5 rounded-full ${dotColor} mr-2 shrink-0`} />
      <span className="text-[13px] font-medium text-[--text-primary] truncate">{label}</span>
    </GlassPanel>
  );
}

function LivePanel({ elapsed, danger }: { elapsed: number; danger: boolean }) {
  const { frame, transcript } = useSignalStore();
  if (!frame) return null;

  return (
    <GlassPanel variant="panel" danger={danger}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-black/[0.06]">
        <span className="text-[12px] font-semibold tracking-[0.02em] text-[--text-primary]">
          SIG<span className="text-[--accent]">NAL</span>
        </span>
        <div className="flex items-center gap-1.5 bg-[rgba(48,209,88,0.12)] text-[#1a8c3a] text-[10px] font-semibold px-2.5 py-1 rounded-full tracking-[0.04em]">
          <div className="w-1.5 h-1.5 rounded-full bg-[--success]" />
          LIVE · {formatTime(elapsed)}
        </div>
      </div>
      <SentimentArc value={frame.sentiment} />
      <BodyLangRead data={frame.bodyLang} />
      <TranscriptFeed lines={transcript} />
      <PromptCard prompt={frame.prompt} />
    </GlassPanel>
  );
}

function PostCallPanel() {
  const { postCallSummary } = useSignalStore();
  if (!postCallSummary) return null;

  return (
    <GlassPanel variant="panel">
      <div className="flex items-center justify-between px-4 py-3 border-b border-black/[0.06]">
        <span className="text-[12px] font-semibold text-[--text-primary]">
          SIG<span className="text-[--accent]">NAL</span>
        </span>
        <span className="text-[10px] font-semibold text-[--text-secondary] tracking-[0.04em]">
          CALL COMPLETE
        </span>
      </div>
      <div className="px-4 py-3 space-y-2">
        {postCallSummary.winSignals.map((s, i) => (
          <div key={i} className="text-[11px] px-3 py-1.5 bg-[rgba(48,209,88,0.08)] rounded-lg text-[#1a8c3a]">
            ✓ {s}
          </div>
        ))}
        {postCallSummary.decisions.map((d, i) => (
          <div key={i} className="text-[11px] px-3 py-1.5 bg-[--accent-subtle] rounded-lg text-[--accent]">
            → {d}
          </div>
        ))}
        <div className="text-[11px] px-3 py-1.5 bg-black/[0.04] rounded-lg text-[--text-secondary]">
          ⟳ Follow-up draft queued
        </div>
      </div>
    </GlassPanel>
  );
}

interface OverlayProps {
  useMockFixture?: boolean;
}

export function Overlay({ useMockFixture = false }: OverlayProps) {
  const {
    overlayState,
    frame,
    elapsedSeconds,
    setOverlayState,
    setFrame,
    appendTranscriptLine,
    setPostCallSummary,
    setElapsedSeconds,
  } = useSignalStore();

  useEffect(() => {
    if (!useMockFixture) return;
    const stop = createFixture({
      onOverlayState: setOverlayState,
      onFrame: setFrame,
      onTranscriptLine: appendTranscriptLine,
      onPostCallSummary: setPostCallSummary,
      onElapsed: setElapsedSeconds,
    });
    return stop;
  }, [useMockFixture]);

  const idleStatus =
    overlayState === 'DANGER' ? 'danger'
    : frame?.prompt.isNudge ? 'nudge'
    : 'nominal';

  return (
    <>
      {overlayState === 'IDLE' && (
        <IdlePill elapsed={elapsedSeconds} status={idleStatus} />
      )}
      {(overlayState === 'LIVE' || overlayState === 'DANGER') && (
        <LivePanel elapsed={elapsedSeconds} danger={overlayState === 'DANGER'} />
      )}
      {overlayState === 'POSTCALL' && <PostCallPanel />}
    </>
  );
}
