import React, { Component, ErrorInfo, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Self-hosted fonts matching requested families, weights, and styles
import '@fontsource/cinzel/500.css';
import '@fontsource/cinzel/600.css';
import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import '@fontsource/inter/300.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/newsreader/400.css';
import '@fontsource/newsreader/500.css';
import '@fontsource/newsreader/400-italic.css';

// Dev-only guard: AI Studio dev environment proxy blocks Vite's HMR WebSocket connection.
// Silence ONLY "WebSocket closed without opened" rejections without swallowing any real application errors.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const message =
      reason instanceof Error
        ? reason.message
        : typeof reason === 'string'
        ? reason
        : reason?.message;

    if (typeof message === 'string' && message.includes('WebSocket closed without opened')) {
      event.preventDefault();
    }
  });
}

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Unhandled UI error caught by ErrorBoundary:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0F1217] text-[#E6E9EF] flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-[#161B22] border border-[#262D38] rounded-lg p-6 shadow-xl space-y-4 text-center">
            <div className="w-12 h-12 mx-auto rounded-full bg-[#E8A94A]/10 border border-[#E8A94A]/30 flex items-center justify-center text-[#E8A94A]">
              <svg
                className="w-6 h-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <h2 className="text-xl font-serif font-semibold text-[#E6E9EF]">
              Something went wrong
            </h2>
            <p className="text-sm text-[#9AA3B2] leading-relaxed">
              DocuLens encountered an unexpected error. Your documents and data in local storage remain safe.
            </p>
            {this.state.error?.message && (
              <div className="p-3 bg-[#0F1217] border border-[#262D38] rounded text-left font-mono text-xs text-[#9AA3B2] max-h-28 overflow-y-auto break-words">
                {this.state.error.message}
              </div>
            )}
            <div className="pt-2">
              <button
                type="button"
                onClick={this.handleReload}
                className="w-full px-4 py-2 text-sm font-medium bg-[#E8A94A] hover:opacity-90 text-[#0F1217] rounded-md transition-all shadow-xs cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8A94A]"
              >
                Reload Application
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
