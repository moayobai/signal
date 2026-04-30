import { useEffect, useState } from 'react';
import {
  DEFAULT_SIGNAL_SERVER_URL,
  type SignalConnectionConfig,
  writeSignalConnectionConfig,
} from '../../lib/connectionConfig';

interface Props {
  config: SignalConnectionConfig;
  onChange: (config: SignalConnectionConfig) => void;
}

export function ConnectionSettings({ config, onChange }: Props) {
  const [serverUrl, setServerUrl] = useState(config.serverUrl || DEFAULT_SIGNAL_SERVER_URL);
  const [authToken, setAuthToken] = useState(config.authToken);
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');

  useEffect(() => {
    setServerUrl(config.serverUrl || DEFAULT_SIGNAL_SERVER_URL);
    setAuthToken(config.authToken);
  }, [config]);

  async function save(): Promise<void> {
    try {
      const next = await writeSignalConnectionConfig({ serverUrl, authToken });
      onChange(next);
      setStatus('saved');
      window.setTimeout(() => setStatus('idle'), 1500);
    } catch {
      setStatus('error');
    }
  }

  return (
    <section className="connection-settings">
      <h3>Connection</h3>
      <label>
        Server URL
        <input
          value={serverUrl}
          onChange={e => setServerUrl(e.target.value)}
          onBlur={() => {
            void save();
          }}
          placeholder="https://signal.example.com"
        />
      </label>
      <label>
        Auth token
        <input
          value={authToken}
          type="password"
          onChange={e => setAuthToken(e.target.value)}
          onBlur={() => {
            void save();
          }}
          placeholder="Required for production"
        />
      </label>
      <button
        className="settings-save"
        onClick={() => {
          void save();
        }}
      >
        Save
      </button>
      {status === 'saved' && <span className="settings-status">Saved</span>}
      {status === 'error' && <span className="settings-status error">Invalid URL</span>}
    </section>
  );
}
