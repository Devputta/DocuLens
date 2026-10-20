import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Download,
  ExternalLink,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Terminal,
  HardDrive,
  Wifi,
  WifiOff,
  CheckCircle2,
  AlertCircle,
  Laptop,
} from 'lucide-react';
import { isStandaloneMode, isIOSDevice } from '../hooks/usePWAInstall';
import { exportBackupArchive } from '../services/backupService';

export interface InstallDialogProps {
  isOpen: boolean;
  onClose: () => void;
  isInstallable: boolean;
  install: () => Promise<boolean>;
  isOnline: boolean;
}

export const InstallDialog: React.FC<InstallDialogProps> = ({
  isOpen,
  onClose,
  isInstallable,
  install,
  isOnline,
}) => {
  const [isCopied, setIsCopied] = useState(false);
  const [showLocalRun, setShowLocalRun] = useState(false);
  const [backupStatus, setBackupStatus] = useState<string | null>(null);
  const [isExportingBackup, setIsExportingBackup] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Focus trap and Escape key listener
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'Tab' && dialogRef.current) {
        const focusableElements = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const first = focusableElements[0];
        const last = focusableElements[focusableElements.length - 1];

        if (!first || !last) return;

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    // Initial focus into dialog
    const timer = setTimeout(() => {
      const firstBtn = dialogRef.current?.querySelector<HTMLElement>('button');
      firstBtn?.focus();
    }, 50);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timer);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isStandalone = isStandaloneMode();
  const isOfflineReady =
    typeof navigator !== 'undefined' && Boolean(navigator.serviceWorker?.controller);
  const isInIframe = typeof window !== 'undefined' && window.self !== window.top;

  // Platform detection via user agent
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent.toLowerCase() : '';
  const isIOS = isIOSDevice();
  const isAndroid = /android/.test(ua);
  const isFirefox = /firefox/.test(ua);
  const isMacOS =
    /macintosh/.test(ua) && !isIOS && typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints <= 1;
  const isMacSafari = isMacOS && /safari/.test(ua) && !/chrome|chromium|edg/.test(ua);

  const localRunScript = `npm install
cp .env.example .env
npm run build
NODE_ENV=production npx tsx server.ts`;

  const handleCopyScript = async () => {
    try {
      await navigator.clipboard.writeText(localRunScript);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleInstallClick = async () => {
    const success = await install();
    if (success) {
      onClose();
    }
  };

  const handleBackupDownload = async () => {
    setIsExportingBackup(true);
    setBackupStatus(null);
    try {
      const res = await exportBackupArchive();
      setBackupStatus(`Backup downloaded: ${res.filename}`);
      setTimeout(() => setBackupStatus(null), 5000);
    } catch (err: any) {
      setBackupStatus(`Failed to export backup: ${err?.message || 'unknown error'}`);
      setTimeout(() => setBackupStatus(null), 5000);
    } finally {
      setIsExportingBackup(false);
    }
  };

  const handleOpenInNewTab = () => {
    if (typeof window !== 'undefined') {
      window.open(window.location.href, '_blank', 'noopener');
    }
  };

  return (
    <div
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in duration-150 overflow-y-auto"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-dialog-title"
        className="w-full max-w-md rounded-xl bg-paper-light border border-paper-border p-6 shadow-2xl text-ink space-y-4 my-8"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-paper-border pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-accent/15 border border-accent/30 flex items-center justify-center text-accent">
              <Download className="w-4 h-4" />
            </div>
            <div>
              <h2
                id="install-dialog-title"
                className="text-base font-serif font-semibold text-ink"
              >
                Download & Install DocuLens
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            title="Close dialog"
            aria-label="Close install dialog"
            className="text-ink-faint hover:text-ink p-1 rounded-md min-h-[36px] min-w-[36px] flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Status Chips Row */}
        <div className="flex items-center flex-wrap gap-2 pt-1" aria-label="System status">
          {/* Online / Offline status */}
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono border ${
              isOnline
                ? 'bg-[#1D242E] text-ink-muted border-[#262D38]'
                : 'bg-accent/15 text-accent border-accent/30'
            }`}
          >
            {isOnline ? (
              <Wifi className="w-3 h-3 text-emerald-400" />
            ) : (
              <WifiOff className="w-3 h-3 text-accent" />
            )}
            <span>{isOnline ? 'Online' : 'Offline'}</span>
          </span>

          {/* Offline-ready service worker chip */}
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono border ${
              isOfflineReady
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : 'bg-[#1D242E] text-ink-faint border-[#262D38]'
            }`}
          >
            <CheckCircle2 className="w-3 h-3" />
            <span>{isOfflineReady ? 'Offline-ready' : 'Offline caching'}</span>
          </span>

          {/* Standalone installed chip */}
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono border ${
              isStandalone
                ? 'bg-accent/20 text-accent border-accent/40 font-semibold'
                : 'bg-[#1D242E] text-ink-muted border-[#262D38]'
            }`}
          >
            <Laptop className="w-3 h-3" />
            <span>{isStandalone ? 'Installed' : 'Web App'}</span>
          </span>
        </div>

        {/* Embedded Iframe Preview Notice */}
        {isInIframe && (
          <div className="p-3.5 bg-paper rounded-lg border border-paper-border space-y-2 text-xs">
            <div className="flex items-start gap-2 text-accent">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold text-ink">
                  Install is not available inside the embedded preview
                </p>
                <p className="text-ink-muted leading-relaxed">
                  Web browser PWA install prompts are disabled inside iframes. Open the app in its own top-level window to install it to your home screen or dock.
                </p>
                {import.meta.env.DEV && (
                  <p className="text-[11px] font-mono text-ink-faint pt-1">
                    Offline mode and install work on the production build / deployed app URL.
                  </p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={handleOpenInNewTab}
              aria-label="Open DocuLens in new tab"
              className="mt-1 w-full py-2 px-3 min-h-[36px] bg-paper-light hover:bg-[#1D242E] border border-paper-border text-ink rounded-md text-xs font-medium flex items-center justify-center gap-2 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <ExternalLink className="w-3.5 h-3.5 text-accent" />
              <span>Open in new tab</span>
            </button>
          </div>
        )}

        {/* Primary Install Action or Platform-Specific Instructions */}
        <div className="space-y-3">
          {isInstallable ? (
            <div className="space-y-2">
              <p className="text-xs text-ink-muted leading-relaxed">
                Install DocuLens for instant offline launch, standalone window mode, and local document processing.
              </p>
              <button
                type="button"
                onClick={handleInstallClick}
                aria-label="Install DocuLens application"
                className="w-full py-2.5 px-4 min-h-[36px] bg-accent hover:opacity-90 text-accent-text rounded-md text-xs font-semibold flex items-center justify-center gap-2 shadow-xs transition-opacity cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <Download className="w-4 h-4 shrink-0" />
                <span>Install DocuLens</span>
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              <p className="text-xs text-ink-muted font-medium">
                How to install DocuLens on your device:
              </p>

              {/* iOS Safari */}
              {isIOS && (
                <div className="p-3.5 bg-paper rounded-lg border border-paper-border text-xs text-ink space-y-2.5 font-sans">
                  <div className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-accent/20 text-accent text-[11px] font-mono flex items-center justify-center font-bold shrink-0 mt-0.5">
                      1
                    </span>
                    <span>
                      Tap the <strong className="text-accent font-semibold">Share</strong> button in the Safari toolbar.
                    </span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-accent/20 text-accent text-[11px] font-mono flex items-center justify-center font-bold shrink-0 mt-0.5">
                      2
                    </span>
                    <span>
                      Scroll down and tap <strong className="text-accent font-semibold">Add to Home Screen</strong>.
                    </span>
                  </div>
                </div>
              )}

              {/* Android Chrome */}
              {!isIOS && isAndroid && (
                <div className="p-3.5 bg-paper rounded-lg border border-paper-border text-xs text-ink space-y-2.5 font-sans">
                  <div className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-accent/20 text-accent text-[11px] font-mono flex items-center justify-center font-bold shrink-0 mt-0.5">
                      1
                    </span>
                    <span>
                      Tap the three-dot menu (<strong className="text-accent font-semibold">⋮</strong>) in Chrome.
                    </span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-accent/20 text-accent text-[11px] font-mono flex items-center justify-center font-bold shrink-0 mt-0.5">
                      2
                    </span>
                    <span>
                      Tap <strong className="text-accent font-semibold">Install app</strong> (or "Add to Home screen").
                    </span>
                  </div>
                </div>
              )}

              {/* macOS Safari */}
              {!isIOS && !isAndroid && isMacSafari && (
                <div className="p-3.5 bg-paper rounded-lg border border-paper-border text-xs text-ink space-y-2.5 font-sans">
                  <div className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-accent/20 text-accent text-[11px] font-mono flex items-center justify-center font-bold shrink-0 mt-0.5">
                      1
                    </span>
                    <span>
                      Click <strong className="text-accent font-semibold">File</strong> in the macOS menu bar.
                    </span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-accent/20 text-accent text-[11px] font-mono flex items-center justify-center font-bold shrink-0 mt-0.5">
                      2
                    </span>
                    <span>
                      Select <strong className="text-accent font-semibold">Add to Dock...</strong>.
                    </span>
                  </div>
                </div>
              )}

              {/* Firefox Desktop */}
              {!isIOS && !isAndroid && isFirefox && (
                <div className="p-3.5 bg-paper rounded-lg border border-paper-border text-xs text-ink space-y-2">
                  <p className="text-ink-muted leading-relaxed">
                    Firefox does not support installing Progressive Web Apps directly to your desktop.
                  </p>
                  <p className="text-ink-muted">
                    For an installed standalone window experience, please open DocuLens in <strong className="text-ink font-semibold">Chrome</strong> or <strong className="text-ink font-semibold">Edge</strong>.
                  </p>
                </div>
              )}

              {/* Chrome / Edge Desktop (Default) */}
              {!isIOS && !isAndroid && !isMacSafari && !isFirefox && (
                <div className="p-3.5 bg-paper rounded-lg border border-paper-border text-xs text-ink space-y-2.5 font-sans">
                  <div className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-accent/20 text-accent text-[11px] font-mono flex items-center justify-center font-bold shrink-0 mt-0.5">
                      1
                    </span>
                    <span>
                      Click the <strong className="text-accent font-semibold">Install</strong> icon in the browser address bar, or
                    </span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-accent/20 text-accent text-[11px] font-mono flex items-center justify-center font-bold shrink-0 mt-0.5">
                      2
                    </span>
                    <span>
                      Open the browser menu (<strong className="text-accent font-semibold">⋮</strong>) and click <strong className="text-accent font-semibold">Install DocuLens</strong>.
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Secondary: Download My Data Backup */}
        <div className="pt-2 border-t border-paper-border space-y-2">
          <button
            type="button"
            onClick={handleBackupDownload}
            disabled={isExportingBackup}
            aria-label="Download my data backup"
            className="w-full py-2 px-3 min-h-[36px] bg-paper hover:bg-[#1D242E] border border-paper-border hover:border-paper-border-dark text-ink rounded-md text-xs font-medium flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <HardDrive className="w-3.5 h-3.5 text-accent shrink-0" />
            <span>{isExportingBackup ? 'Creating backup...' : 'Download my data backup'}</span>
          </button>
          {backupStatus && (
            <p className="text-[11px] font-mono text-center text-ink-muted">
              {backupStatus}
            </p>
          )}
        </div>

        {/* Collapsible: Run on my computer */}
        <div className="border border-paper-border rounded-lg bg-paper overflow-hidden text-xs">
          <button
            type="button"
            onClick={() => setShowLocalRun(!showLocalRun)}
            aria-expanded={showLocalRun}
            aria-label="Toggle run on my computer section"
            className="w-full py-2.5 px-3 min-h-[36px] flex items-center justify-between text-ink hover:text-accent hover:bg-[#1D242E] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <div className="flex items-center gap-2 font-medium">
              <Terminal className="w-3.5 h-3.5 text-accent shrink-0" />
              <span>Run on my computer</span>
            </div>
            {showLocalRun ? (
              <ChevronUp className="w-4 h-4 text-ink-faint" />
            ) : (
              <ChevronDown className="w-4 h-4 text-ink-faint" />
            )}
          </button>

          {showLocalRun && (
            <div className="p-3 border-t border-paper-border space-y-2.5 bg-[#0F1217]">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-ink-muted font-mono">Terminal commands:</span>
                <button
                  type="button"
                  onClick={handleCopyScript}
                  aria-label="Copy terminal commands"
                  className="flex items-center gap-1 text-[11px] text-accent hover:underline py-1 px-2 min-h-[36px] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  {isCopied ? (
                    <>
                      <Check className="w-3 h-3" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>

              <pre className="p-2.5 rounded bg-paper-light border border-paper-border text-[11px] font-mono text-ink overflow-x-auto whitespace-pre leading-relaxed">
                <code>{localRunScript}</code>
              </pre>

              <p className="text-[11px] text-ink-faint leading-relaxed">
                Open <span className="font-mono text-accent">http://localhost:3000</span>, then use Install in the browser.
              </p>
            </div>
          )}
        </div>

        {/* Done / Close Button */}
        <div className="pt-2">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="w-full py-2.5 bg-paper-border hover:bg-[#343D4B] text-ink rounded-md text-xs font-semibold min-h-[36px] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
