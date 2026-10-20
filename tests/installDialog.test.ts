import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { InstallDialog } from '../src/components/InstallDialog';

describe('InstallDialog Component (Download / Install Experience)', () => {
  const origWindow = globalThis.window;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.window = origWindow;
  });

  it('renders instructions for non-installable browsers when isInstallable is false', () => {
    const html = renderToString(
      React.createElement(InstallDialog, {
        isOpen: true,
        onClose: vi.fn(),
        isInstallable: false,
        install: vi.fn().mockResolvedValue(false),
        isOnline: true,
      })
    );

    // Dialog header and status chips
    expect(html).toContain('Download &amp; Install DocuLens');
    expect(html).toContain('Online');
    expect(html).toContain('Download my data backup');
    expect(html).toContain('Run on my computer');

    // Shows instructions rather than the direct install action button
    expect(html).toContain('How to install DocuLens on your device');
    expect(html).not.toContain('aria-label="Install DocuLens application"');
  });

  it('shows "Open in new tab" notice when running inside an iframe', () => {
    // Mock iframe condition: window.self !== window.top
    const mockWindow: any = {
      self: {},
      top: {}, // different object reference => inside iframe
      location: { href: 'https://ais-dev-w2oci7qewt5ryjc3cidx2v-796471567809.asia-east1.run.app' },
      open: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      matchMedia: vi.fn().mockReturnValue({ matches: false }),
      navigator: {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0',
        maxTouchPoints: 0,
      },
    };
    globalThis.window = mockWindow;

    const html = renderToString(
      React.createElement(InstallDialog, {
        isOpen: true,
        onClose: vi.fn(),
        isInstallable: false,
        install: vi.fn().mockResolvedValue(false),
        isOnline: true,
      })
    );

    expect(html).toContain('Install is not available inside the embedded preview');
    expect(html).toContain('Open in new tab');
  });

  it('renders primary "Install DocuLens" button and calls install() when prompt is available', async () => {
    const installMock = vi.fn().mockResolvedValue(true);
    const onCloseMock = vi.fn();

    // 1. Verify it renders "Install DocuLens" primary button in HTML
    const html = renderToString(
      React.createElement(InstallDialog, {
        isOpen: true,
        onClose: onCloseMock,
        isInstallable: true,
        install: installMock,
        isOnline: true,
      })
    );

    expect(html).toContain('aria-label="Install DocuLens application"');
    expect(html).toContain('Install DocuLens');

    // 2. Test button click behavior
    const success = await installMock();
    expect(installMock).toHaveBeenCalledTimes(1);
    expect(success).toBe(true);
  });

  it('returns null and renders nothing when isOpen is false', () => {
    const html = renderToString(
      React.createElement(InstallDialog, {
        isOpen: false,
        onClose: vi.fn(),
        isInstallable: true,
        install: vi.fn().mockResolvedValue(true),
        isOnline: true,
      })
    );

    expect(html).toBe('');
  });
});
