

import React from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  
  fallback?: React.ReactNode;
  
  inline?: boolean;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo });
    
    console.error('[ErrorBoundary] Uncaught error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    if (this.props.fallback) return this.props.fallback;

    if (this.props.inline) {
      return (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">Component Error</p>
            <p className="text-xs text-red-400/80 truncate">{this.state.error?.message ?? 'Unknown error'}</p>
          </div>
          <button
            onClick={this.handleReset}
            className="flex-shrink-0 p-1.5 rounded-lg hover:bg-red-500/20 transition-colors"
            title="Retry"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      );
    }

    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'var(--bg-base, #020817)' }}>
        <div className="max-w-lg w-full bg-slate-900/80 border border-red-500/20 rounded-2xl p-8 text-center">
          <div className="w-14 h-14 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-6">
            <AlertTriangle className="w-7 h-7 text-red-400" />
          </div>
          <h1 className="text-xl font-bold text-white mb-2">Something Went Wrong</h1>
          <p className="text-slate-400 text-sm mb-4">
            An unexpected error occurred. This has been logged.
          </p>
          {this.state.error && (
            <details className="mb-6 text-left">
              <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-400 transition-colors mb-2">
                Error Details
              </summary>
              <pre className="text-xs text-red-400/80 bg-slate-950 rounded-lg p-3 overflow-auto max-h-40 whitespace-pre-wrap break-all">
                {this.state.error.message}
                {this.state.errorInfo?.componentStack}
              </pre>
            </details>
          )}
          <div className="flex gap-3 justify-center">
            <button
              onClick={this.handleReset}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <RefreshCw className="w-4 h-4" /> Try Again
            </button>
            <button
              onClick={() => { this.handleReset(); window.location.href = '/'; }}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium rounded-lg transition-colors"
            >
              <Home className="w-4 h-4" /> Go Home
            </button>
          </div>
        </div>
      </div>
    );
  }
}
