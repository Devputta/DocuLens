import React, { useState } from 'react';
import {
  FileText,
  BookOpen,
  Search,
  MessageSquare,
  Table as TableIcon,
  GitCompare,
  Settings,
  Menu,
  X,
  HelpCircle,
  Wifi,
  WifiOff,
  Shield,
  Layers,
  Image as ImageIcon,
  Download,
  RefreshCw,
} from 'lucide-react';
import { DocumentEntity } from '../types/doculens';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { InstallDialog } from './InstallDialog';

export type ActiveTab =
  | 'library'
  | 'reader'
  | 'search'
  | 'inquiry'
  | 'tables'
  | 'figures'
  | 'compare'
  | 'workspace';

interface HeaderProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  documents: DocumentEntity[];
  selectedDocId?: string;
  onSelectDoc: (id?: string) => void;
  isOnline: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onSelectTab,
  documents,
  selectedDocId,
  onSelectDoc,
  isOnline,
}) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isInstallDialogOpen, setIsInstallDialogOpen] = useState(false);

  const { isInstallable, isInstalled, install, updateAvailable, reloadApp } =
    usePWAInstall();

  const navItems = [
    { id: 'library' as ActiveTab, label: 'Library', icon: FileText },
    { id: 'reader' as ActiveTab, label: 'Reader', icon: BookOpen },
    { id: 'search' as ActiveTab, label: 'Search', icon: Search },
    { id: 'inquiry' as ActiveTab, label: 'Ask Documents', icon: MessageSquare },
    { id: 'tables' as ActiveTab, label: 'Tables', icon: TableIcon },
    { id: 'figures' as ActiveTab, label: 'Figures', icon: ImageIcon },
    { id: 'compare' as ActiveTab, label: 'Compare', icon: GitCompare },
  ];

  const handleTabClick = (tab: ActiveTab) => {
    onSelectTab(tab);
    setIsMobileMenuOpen(false);
  };

  return (
    <>
      <header className="border-b border-paper-border bg-paper-light text-ink sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          {/* Left: Logo and DocuLens Wordmark */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => handleTabClick('library')}
              className="flex items-center gap-2.5 text-left group min-h-[36px] rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper transition-all"
              title="DocuLens Home"
            >
              <div className="w-9 h-9 rounded-md border border-paper-border bg-paper p-1 flex items-center justify-center shrink-0 shadow-xs group-hover:border-accent transition-colors">
                <img
                  src="/doculens-mark-transparent.png"
                  alt="DocuLens Logo"
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="font-serif font-bold tracking-wide text-lg text-ink">
                  DocuLens
                </span>
                <span className="text-[10px] font-mono uppercase px-1 py-0.5 rounded bg-paper-dim text-ink-muted tracking-widest hidden sm:inline">
                  v1.0
                </span>
              </div>
            </button>
          </div>

          {/* Middle: Clean Desktop Navigation */}
          <nav
            className="hidden md:flex items-center gap-1 lg:gap-1.5"
            aria-label="Primary Navigation"
          >
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleTabClick(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex items-center gap-2 px-3 py-2 min-h-[36px] rounded-md text-[13px] font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper ${
                    isActive
                      ? 'bg-accent/20 text-accent font-semibold border border-accent-border'
                      : 'text-ink-muted hover:text-ink hover:bg-paper-dim'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      isActive ? 'text-accent' : 'text-ink-faint'
                    }`}
                  />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Right: Actions (Settings, Help, Local Status) */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* GitHub Repository Link */}
            <a
              href="https://github.com/Devputta/DocuLens"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="View DocuLens source code on GitHub"
              title="View source on GitHub (Devputta/DocuLens)"
              className="p-2 min-h-[36px] min-w-[36px] flex items-center justify-center text-ink-muted hover:text-ink hover:bg-paper-dim rounded-md border border-paper-border transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
            >
              <svg
                viewBox="0 0 16 16"
                width="16"
                height="16"
                fill="currentColor"
                aria-hidden="true"
                className="w-4 h-4 shrink-0"
              >
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
              </svg>
            </a>

            {/* Help / Info Dialog trigger */}
            <button
              onClick={() => setIsHelpOpen(true)}
              title="Help, Shortcuts & Architecture"
              aria-label="Help and Architecture Details"
              className="p-2 min-h-[36px] min-w-[36px] flex items-center justify-center text-ink-muted hover:text-ink hover:bg-paper-dim rounded-md border border-paper-border transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
            >
              <HelpCircle className="w-4 h-4" />
            </button>

            {/* Service Worker Update Available Notice */}
            {updateAvailable && (
              <button
                onClick={reloadApp}
                title="New version available. Click to reload and apply update."
                aria-label="Update available, reload"
                className="flex items-center gap-1.5 px-2.5 py-1.5 min-h-[36px] text-xs font-semibold rounded-md bg-accent text-accent-text hover:bg-accent-hover transition-all duration-150 shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <RefreshCw className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">Update available, reload</span>
                <span className="sm:hidden">Reload</span>
              </button>
            )}

            {/* In-App Install Button */}
            {!isInstalled && (
              <button
                onClick={() => setIsInstallDialogOpen(true)}
                title="Install DocuLens for offline use"
                aria-label="Install DocuLens for offline use"
                className="flex items-center gap-1.5 px-2.5 py-1.5 min-h-[36px] text-xs font-medium text-ink-muted hover:text-ink hover:bg-paper-dim rounded-md border border-paper-border transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper cursor-pointer"
              >
                <Download className="w-4 h-4 text-accent shrink-0" />
                <span>Install</span>
              </button>
            )}

            {/* Settings / Workspace */}
            <button
              onClick={() => handleTabClick('workspace')}
              title="Settings & Storage Workspace"
              aria-label="Settings Workspace"
              className={`flex items-center gap-1.5 px-3 py-2 min-h-[36px] rounded-md border text-[13px] font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper ${
                activeTab === 'workspace'
                  ? 'border-accent text-accent bg-accent-subtle'
                  : 'border-paper-border text-ink-muted hover:text-ink hover:bg-paper-dim'
              }`}
            >
              <Settings className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">Settings</span>
            </button>

            {/* Offline Status Icon (Show nothing when online, small amber icon when offline) */}
            {!isOnline && (
              <div
                className="flex items-center justify-center p-2 min-h-[36px] min-w-[36px] rounded-md"
                title="Offline mode active. Full search, parsing, tables, and comparison remain functional."
              >
                <WifiOff className="w-4 h-4 text-accent" />
              </div>
            )}

            {/* Mobile Hamburger Toggle */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-label="Toggle navigation menu"
              className="md:hidden p-2 min-h-[36px] min-w-[36px] flex items-center justify-center text-ink hover:bg-paper-dim rounded-md border border-paper-border transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
            >
              {isMobileMenuOpen ? (
                <X className="w-5 h-5 text-accent" />
              ) : (
                <Menu className="w-5 h-5 text-ink" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {isMobileMenuOpen && (
          <div className="md:hidden border-t border-paper-border bg-paper-light px-4 py-3 space-y-3 shadow-lg animate-in fade-in duration-150">
            {/* Nav Links */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleTabClick(item.id)}
                    className={`flex items-center gap-2 p-3 min-h-[44px] rounded-md text-[13px] font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                      isActive
                        ? 'bg-accent-subtle text-accent font-semibold border border-accent-border'
                        : 'bg-paper text-ink-muted hover:text-ink hover:bg-paper-dim border border-paper-border'
                    }`}
                  >
                    <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-accent' : 'text-ink-faint'}`} />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="pt-2 border-t border-paper-border flex items-center justify-between text-xs text-ink-muted">
              <span className="flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-ink-muted" />
                <span>Local-first · IndexedDB</span>
              </span>
              <span>{isOnline ? 'Network Connected' : 'Offline Mode'}</span>
            </div>
          </div>
        )}
      </header>

      {/* Help & Architecture Modal */}
      {isHelpOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="help-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
        >
          <div className="bg-paper-light border border-paper-border rounded-xl max-w-xl w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-paper-border pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-md bg-paper border border-paper-border p-1 flex items-center justify-center">
                  <img
                    src="/doculens-mark-transparent.png"
                    alt="DocuLens"
                    className="w-full h-full object-contain"
                  />
                </div>
                <h2 id="help-title" className="font-serif font-bold text-lg text-ink">
                  DocuLens Guide & Quick Reference
                </h2>
              </div>
              <button
                onClick={() => setIsHelpOpen(false)}
                className="text-ink-faint hover:text-ink p-1.5 rounded-md min-h-[36px] min-w-[36px] flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                aria-label="Close help modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-[13px] text-ink-muted leading-relaxed">
              <div className="p-3 bg-paper rounded-lg border border-paper-border space-y-1">
                <span className="font-semibold text-ink">Local-First Privacy Architecture</span>
                <p>
                  All document uploads, text extraction, page parsing, table detection, and lexical
                  searches are executed 100% inside your browser via IndexedDB. Documents are never
                  uploaded to external servers without explicit disclosure.
                </p>
              </div>

              <div className="space-y-2">
                <span className="font-semibold text-ink uppercase text-xs tracking-wider">
                  Workspace Destinations
                </span>
                <ul className="list-disc list-inside space-y-1.5 pl-1">
                  <li>
                    <strong className="text-ink">Library:</strong> Ingest PDFs, inspect page/element
                    counts, and delete documents.
                  </li>
                  <li>
                    <strong className="text-ink">Reader:</strong> Visual page canvas with element
                    provenance inspection and marginalia annotations.
                  </li>
                  <li>
                    <strong className="text-ink">Search:</strong> Deterministic BM25 lexical search with
                    exact phrase bonuses and multi-term highlight jumps.
                  </li>
                  <li>
                    <strong className="text-ink">Ask Documents:</strong> Evidence-grounded inquiries with
                    backend citation verification.
                  </li>
                  <li>
                    <strong className="text-ink">Tables:</strong> Extracted document tables with
                    formula-injection-safe CSV exports.
                  </li>
                  <li>
                    <strong className="text-ink">Compare:</strong> Intelligent comparison across content
                    diffs, shared concepts, definitions, and topic overlap.
                  </li>
                </ul>
              </div>

              <div className="space-y-2 border-t border-paper-border pt-3">
                <span className="font-semibold text-ink uppercase text-xs tracking-wider">
                  Keyboard Shortcuts in Reader
                </span>
                <div className="grid grid-cols-2 gap-2 font-mono text-xs">
                  <div className="p-2 bg-paper rounded-md border border-paper-border">
                    <span className="text-accent font-medium">← Left Arrow:</span> Previous page
                  </div>
                  <div className="p-2 bg-paper rounded-md border border-paper-border">
                    <span className="text-accent font-medium">→ Right Arrow:</span> Next page
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-paper-border flex justify-end">
              <button
                onClick={() => setIsHelpOpen(false)}
                className="bg-ink hover:opacity-90 text-paper min-h-[36px] px-5 py-2 rounded-md text-[13px] font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Install & Download Dialog */}
      <InstallDialog
        isOpen={isInstallDialogOpen}
        onClose={() => setIsInstallDialogOpen(false)}
        isInstallable={isInstallable}
        install={install}
        isOnline={isOnline}
      />
    </>
  );
};
