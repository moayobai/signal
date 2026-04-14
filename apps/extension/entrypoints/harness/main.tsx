import { createRoot } from 'react-dom/client';
import { useSignalStore } from '../../overlay/store';
import { Overlay } from '../../overlay/Overlay';
import type { OverlayState } from '@signal/types';
import '../../assets/styles/globals.css';

const STATES: OverlayState[] = ['IDLE', 'LIVE', 'DANGER', 'POSTCALL'];

function HarnessControls() {
  const { overlayState, setOverlayState, reset } = useSignalStore();

  return (
    <div
      style={{
        position: 'fixed',
        top: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: 8,
        zIndex: 9999,
      }}
    >
      {STATES.map((s) => (
        <button
          key={s}
          onClick={() => setOverlayState(s)}
          style={{
            padding: '6px 14px',
            borderRadius: 100,
            border: '1px solid rgba(255,255,255,0.2)',
            background: overlayState === s ? 'rgba(0,113,227,0.8)' : 'rgba(255,255,255,0.1)',
            color: '#fff',
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
            letterSpacing: '0.04em',
            fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
            backdropFilter: 'blur(8px)',
          }}
        >
          {s}
        </button>
      ))}
      <button
        onClick={reset}
        style={{
          padding: '6px 14px',
          borderRadius: 100,
          border: '1px solid rgba(255,255,255,0.15)',
          background: 'rgba(255,255,255,0.06)',
          color: 'rgba(255,255,255,0.5)',
          fontSize: 11,
          fontWeight: 600,
          cursor: 'pointer',
          letterSpacing: '0.04em',
          fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
          backdropFilter: 'blur(8px)',
        }}
      >
        RESET
      </button>
    </div>
  );
}

function HarnessApp() {
  return (
    <>
      <HarnessControls />
      <div
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          zIndex: 1000,
        }}
      >
        <Overlay useMockFixture={true} />
      </div>
    </>
  );
}

const root = document.getElementById('root')!;
createRoot(root).render(<HarnessApp />);
