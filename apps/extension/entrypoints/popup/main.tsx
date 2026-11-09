import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { PreCallSetup } from '../../components/popup/PreCallSetup';
import { PostCallView } from '../../components/popup/PostCallView';
import type { PostCallSummary, Prospect } from '@signal/types';
import type { StartCaptureResult } from '../../lib/messages';
import { POST_CALL_KEYS, resolvePopupView, type PopupView, type StoredPopupState } from '../../lib/popupState';
import '../../components/popup/popup.css';

function Popup() {
  const [view, setView] = useState<PopupView>('pre');
  const [prospect, setProspect] = useState<Prospect>({ name: '', company: '', email: '', linkedinUrl: '' });
  const [summary, setSummary] = useState<PostCallSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Load last detected prospect, capture status and any stored summary
  useEffect(() => {
    chrome.storage.session.get(['detectedProspect', 'latestSummary', 'popupView', 'captureActive']).then((d: Record<string, any>) => {
      if (d.detectedProspect) setProspect(p => ({ ...p, ...d.detectedProspect }));
      if (d.latestSummary) setSummary(d.latestSummary);
      setView(resolvePopupView(d as StoredPopupState));
    });
  }, []);

  const handleStart = async (callType: 'investor' | 'enterprise' | 'bd' | 'customer') => {
    setError(null);
    setBusy(true);
    try {
      await chrome.storage.session.set({ pendingProspect: prospect, pendingCallType: callType });
      const res = await chrome.runtime.sendMessage({ type: 'POPUP_START_REQUEST' }) as StartCaptureResult | undefined;
      if (res?.ok) { window.close(); return; }
      setError(res && !res.ok ? res.error : 'Could not start capture.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start capture.');
    } finally {
      setBusy(false);
    }
  };

  const handleStop = async () => {
    setBusy(true);
    await chrome.runtime.sendMessage({ type: 'STOP_CAPTURE' }).catch(() => {});
    window.close();
  };

  const handleNewCall = () => {
    chrome.storage.session.remove([...POST_CALL_KEYS]).catch(() => {});
    setSummary(null);
    setView('pre');
  };

  return (
    <div className="popup">
      <header>SIGNAL</header>
      {error && <div className="empty" role="alert">{error}</div>}
      {view === 'live' ? (
        <div className="pre-call">
          <div className="empty">Call in progress.</div>
          <button className="start-btn" disabled={busy} onClick={handleStop}>End Call</button>
        </div>
      ) : view === 'pre' ? (
        <PreCallSetup prospect={prospect} onChange={setProspect} onStart={busy ? () => {} : handleStart} />
      ) : summary ? (
        <PostCallView summary={summary} onNewCall={handleNewCall} />
      ) : (
        <div className="empty">No summary available.</div>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<Popup />);
