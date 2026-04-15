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

  // Re-show the nudge card whenever a new frame version arrives
  useEffect(() => { setNudgeDismissed(false); }, [frameVersion]);

  const danger = overlayState === 'DANGER';
  const showNudge = (overlayState === 'LIVE' || overlayState === 'DANGER')
    && frame
    && frame.prompt.type !== 'IDLE'
    && !nudgeDismissed;

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
              frame={frame}
              danger={danger}
              freshKey={frameVersion}
              onDismiss={() => setNudgeDismissed(true)}
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
