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

function HarnessBackdrop() {
  // Faux call background — gives the glass something real to blur over
  // so we can preview what the HUD looks like on a live video call.
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 0,
      background:
        'radial-gradient(at 18% 20%, rgba(96,165,250,0.22), transparent 42%),' +
        'radial-gradient(at 82% 80%, rgba(245,165,36,0.18), transparent 48%),' +
        'radial-gradient(at 50% 50%, rgba(192,132,252,0.12), transparent 60%),' +
        '#0a0b10',
      overflow: 'hidden',
    }}>
      {/* Simulated video participant tiles */}
      <div style={{
        position: 'absolute',
        inset: '72px 24px 24px 24px',
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 16,
      }}>
        {[
          { name: 'James Carter', sub: 'Acme Ventures', color: 'rgba(96,165,250,0.12)' },
          { name: 'You',          sub: 'Host',          color: 'rgba(245,165,36,0.12)' },
          { name: 'Priya Nair',   sub: 'Sequoia',       color: 'rgba(192,132,252,0.12)' },
          { name: 'Marcus Chen',  sub: 'Figma',         color: 'rgba(52,211,153,0.10)' },
        ].map((p, i) => (
          <div key={i} style={{
            position: 'relative',
            borderRadius: 18,
            background: `linear-gradient(135deg, ${p.color}, rgba(20,20,28,0.5))`,
            border: '1px solid rgba(255,255,255,0.06)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%',
              background: p.color,
              border: '1px solid rgba(255,255,255,0.12)',
              display: 'grid', placeItems: 'center',
              fontFamily: 'Fraunces, Georgia, serif',
              fontSize: 22, color: 'rgba(255,255,255,0.8)',
            }}>
              {p.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
            </div>
            <div style={{
              position: 'absolute',
              left: 16, bottom: 14,
              color: 'rgba(255,255,255,0.85)',
              fontFamily: '-apple-system, sans-serif',
              fontSize: 13,
              letterSpacing: '-0.01em',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span>{p.name}</span>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>· {p.sub}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function HarnessApp() {
  return (
    <>
      <HarnessBackdrop />
      <HarnessControls />
      <Overlay useMockFixture={true} />
    </>
  );
}

const root = document.getElementById('root')!;
createRoot(root).render(<HarnessApp />);
