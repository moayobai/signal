import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { PreCallSetup } from '../../components/popup/PreCallSetup';
import { PostCallView } from '../../components/popup/PostCallView';
import type { PostCallSummary, Prospect } from '@signal/types';
import '../../components/popup/popup.css';

type View = 'pre' | 'post';

function Popup() {
  const [view, setView] = useState<View>('pre');
  const [prospect, setProspect] = useState<Prospect>({ name: '', company: '', email: '', linkedinUrl: '' });
  const [summary, setSummary] = useState<PostCallSummary | null>(null);

  // Load last detected prospect + any stored summary
  useEffect(() => {
    chrome.storage.session.get(['detectedProspect', 'latestSummary', 'popupView']).then((d) => {
      if (d.detectedProspect) setProspect(p => ({ ...p, ...d.detectedProspect }));
      if (d.latestSummary) setSummary(d.latestSummary);
      if (d.popupView === 'post') setView('post');
    });
  }, []);

  const handleStart = async (callType: 'investor' | 'enterprise' | 'bd' | 'customer') => {
    await chrome.storage.session.set({ pendingProspect: prospect, pendingCallType: callType });
    chrome.runtime.sendMessage({ type: 'POPUP_START_REQUEST' });
    window.close();
  };

  return (
    <div className="popup">
      <header>SIGNAL</header>
      {view === 'pre' ? (
        <PreCallSetup prospect={prospect} onChange={setProspect} onStart={handleStart} />
      ) : summary ? (
        <PostCallView summary={summary} onNewCall={() => { setSummary(null); setView('pre'); }} />
      ) : (
        <div className="empty">No summary available.</div>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<Popup />);
