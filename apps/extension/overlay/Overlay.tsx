import './overlay.css';
import { useEffect, useState } from 'react';
import { useSignalStore } from './store';
import { createFixture } from '../mock/fixture';
import { NudgeCard } from './components/NudgeCard';
import { LiveSidebar } from './components/LiveSidebar';

function formatTime(s: number): string {
  const m = Math.floor(s / 60).toString().padStart(2, '0');
  const sec = (s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
}

interface OverlayProps {
  useMockFixture?: boolean;
}

export function Overlay({ useMockFixture = false }: OverlayProps) {
  const {
    overlayState,
    frame, prevSentiment, cueHistory, frameVersion,
    transcript, elapsedSeconds, postCallSummary,
    setOverlayState, setFrame, appendTranscriptLine, setPostCallSummary, setElapsedSeconds,
  } = useSignalStore();

  const [collapsed, setCollapsed] = useState(false);
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  /** When set to a future timestamp, new nudges are suppressed until that moment. */
  const [snoozeUntil, setSnoozeUntil] = useState(0);
  /** Type of the last frame for which a nudge was rendered — prevents re-animation churn. */
  const [lastAnimatedType, setLastAnimatedType] = useState<string | null>(null);

  // Global Escape key: dismiss nudge + snooze for 5s
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setNudgeDismissed(true);
        setSnoozeUntil(Date.now() + 5_000);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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

  // Re-show the nudge card whenever a new frame version arrives —
  // but skip if we're still within the snooze window.
  useEffect(() => {
    if (Date.now() < snoozeUntil) return;
    setNudgeDismissed(false);
  }, [frameVersion, snoozeUntil]);

  // Only re-animate the nudge card when the prompt TYPE changes
  // (back-to-back REFRAME frames shouldn't cause the card to bounce).
  useEffect(() => {
    if (frame && frame.prompt.type !== 'IDLE' && frame.prompt.type !== lastAnimatedType) {
      setLastAnimatedType(frame.prompt.type);
    }
  }, [frame?.prompt.type, lastAnimatedType]);

  const danger = overlayState === 'DANGER';
  const showNudge = (overlayState === 'LIVE' || overlayState === 'DANGER')
    && frame
    && frame.prompt.type !== 'IDLE'
    && !nudgeDismissed
    && Date.now() >= snoozeUntil;

  return (
    <div className="sig-root">
      {overlayState === 'IDLE' && (
        <div className="sig-pill">
          <span className="dot" />
          <span>Signal</span>
          <span className="time">{formatTime(elapsedSeconds)}</span>
        </div>
      )}

      {(overlayState === 'LIVE' || overlayState === 'DANGER') && (
        <>
          {showNudge && frame && (
            <NudgeCard
              // Key on the prompt type (not every frame tick) so the card only re-animates
              // when the SIGNAL category actually changes.
              key={lastAnimatedType ?? frame.prompt.type}
              frame={frame}
              danger={danger}
              freshKey={frameVersion}
              onDismiss={() => {
                setNudgeDismissed(true);
                setSnoozeUntil(Date.now() + 5_000);
              }}
            />
          )}

          {!collapsed ? (
            <LiveSidebar
              frame={frame}
              prevSentiment={prevSentiment}
              cueHistory={cueHistory}
              transcript={transcript}
              elapsedSeconds={elapsedSeconds}
              danger={danger}
              onCollapse={() => setCollapsed(true)}
            />
          ) : (
            <div
              className={`sig-pill ${danger ? 'danger' : ''}`}
              onClick={() => setCollapsed(false)}
            >
              <span className="dot" />
              <span>Signal</span>
              <span className="time">{formatTime(elapsedSeconds)}</span>
            </div>
          )}
        </>
      )}

      {overlayState === 'POSTCALL' && postCallSummary && (
        <div className="sig-postcall">
          <div className="head">
            <div>
              <div className="eyebrow">Call complete</div>
              <h2>Here's what happened.</h2>
            </div>
          </div>

          <h3 className="win">Win signals</h3>
          <ul className="win">
            {postCallSummary.winSignals.map((s, i) => <li key={i}>{s}</li>)}
          </ul>

          <h3 className="obj">Objections</h3>
          <ul className="obj">
            {postCallSummary.objections.map((s, i) => <li key={i}>{s}</li>)}
          </ul>

          <h3 className="dec">Decisions</h3>
          <ul className="dec">
            {postCallSummary.decisions.map((s, i) => <li key={i}>{s}</li>)}
          </ul>

          <div className="followup">{postCallSummary.followUpDraft}</div>
        </div>
      )}
    </div>
  );
}
