import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: (error: Error) => ReactNode;
}
interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback(this.state.error);
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            gap: 12,
            color: 'var(--ink-2)',
            fontFamily: 'var(--font-ui)',
          }}
        >
          <span style={{ fontSize: 28 }}>⚠</span>
          <p style={{ margin: 0 }}>Something went wrong loading this page.</p>
          <pre
            style={{
              fontSize: 11,
              color: 'var(--ink-3)',
              maxWidth: 480,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}
          >
            {this.state.error.message}
          </pre>
          <button className="btn" onClick={() => this.setState({ error: null })}>
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
