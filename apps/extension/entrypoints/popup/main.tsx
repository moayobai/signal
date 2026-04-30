import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { PreCallSetup } from '../../components/popup/PreCallSetup';
import { PostCallView } from '../../components/popup/PostCallView';
import { ConnectionSettings } from '../../components/popup/ConnectionSettings';
import type { PostCallSummary, Prospect } from '@signal/types';
import {
  DEFAULT_SIGNAL_SERVER_URL,
  readSignalConnectionConfig,
  type SignalConnectionConfig,
} from '../../lib/connectionConfig';
import '../../components/popup/popup.css';

type View = 'pre' | 'post';

declare const __WS_URL__: string;
declare const __SIGNAL_AUTH_TOKEN__: string;

const DEFAULT_CONNECTION: SignalConnectionConfig = {
  serverUrl: DEFAULT_SIGNAL_SERVER_URL,
  authToken: typeof __SIGNAL_AUTH_TOKEN__ !== 'undefined' ? __SIGNAL_AUTH_TOKEN__ : '',
};

if (typeof __WS_URL__ !== 'undefined') {
  DEFAULT_CONNECTION.serverUrl = __WS_URL__;
}

function isProspect(value: unknown): value is Partial<Prospect> {
  return typeof value === 'object' && value !== null;
}

function Popup() {
  const [view, setView] = useState<View>('pre');
  const [prospect, setProspect] = useState<Prospect>({
    name: '',
    company: '',
    email: '',
    linkedinUrl: '',
  });
  const [summary, setSummary] = useState<PostCallSummary | null>(null);
  const [connection, setConnection] = useState<SignalConnectionConfig>(DEFAULT_CONNECTION);
  const [showSettings, setShowSettings] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  // Load last detected prospect + any stored summary
  useEffect(() => {
    chrome.storage.session
      .get(['detectedProspect', 'latestSummary', 'popupView'])
      .then((d: Record<string, unknown>) => {
        const detectedProspect = d.detectedProspect;
        if (isProspect(detectedProspect)) setProspect(p => ({ ...p, ...detectedProspect }));
        if (d.latestSummary) setSummary(d.latestSummary as PostCallSummary);
        if (d.popupView === 'post') setView('post');
      });
    readSignalConnectionConfig(DEFAULT_CONNECTION)
      .then(setConnection)
      .catch(() => {});
  }, []);

  const handleStart = async (callType: 'investor' | 'enterprise' | 'bd' | 'customer') => {
    setStartError(null);
    await chrome.storage.session.set({ pendingProspect: prospect, pendingCallType: callType });
    const res = (await chrome.runtime.sendMessage({ type: 'POPUP_START_REQUEST' })) as
      | { ok?: boolean; error?: string }
      | undefined;
    if (res?.ok) {
      window.close();
      return;
    }
    setStartError(res?.error ?? 'Unable to start capture');
  };

  const hasToken = connection.authToken.trim().length > 0;

  return (
    <div className="popup">
      <header>
        <span>SIGNAL</span>
        <button
          className={hasToken ? 'header-action' : 'header-action warning'}
          onClick={() => setShowSettings(v => !v)}
        >
          Connection
        </button>
      </header>
      {(showSettings || !hasToken) && (
        <ConnectionSettings config={connection} onChange={setConnection} />
      )}
      {startError && <div className="error-banner">{startError}</div>}
      {view === 'pre' ? (
        <PreCallSetup
          prospect={prospect}
          connectionReady={hasToken}
          onChange={setProspect}
          onStart={handleStart}
        />
      ) : summary ? (
        <PostCallView
          summary={summary}
          onNewCall={() => {
            setSummary(null);
            setView('pre');
          }}
        />
      ) : (
        <div className="empty">No summary available.</div>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<Popup />);
