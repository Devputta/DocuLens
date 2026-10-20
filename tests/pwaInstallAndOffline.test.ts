import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import {
  registerServiceWorker,
  skipWaitingAndReload,
} from '../src/services/serviceWorkerRegistration';
import {
  isStandaloneMode,
  isIOSDevice,
} from '../src/hooks/usePWAInstall';

describe('PWA Install & Offline Service Worker (Requirement 10)', () => {
  const origNavDesc = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    delete (globalThis as any).window;
    if (origNavDesc) {
      Object.defineProperty(globalThis, 'navigator', origNavDesc);
    }
  });

  describe('Web App Manifest Verification', () => {
    it('provides a valid manifest.json with required fields and theme colors', () => {
      const manifestPath = resolve(process.cwd(), 'public/manifest.json');
      expect(existsSync(manifestPath)).toBe(true);

      const raw = readFileSync(manifestPath, 'utf-8');
      const manifest = JSON.parse(raw);

      expect(manifest.name).toBe('DocuLens — Local-First Document Intelligence');
      expect(manifest.short_name).toBe('DocuLens');
      expect(manifest.theme_color).toBe('#0F1217');
      expect(manifest.background_color).toBe('#0F1217');
      expect(manifest.display).toBe('standalone');

      // Verify icons 192, 512 and maskable icons are present
      const icons = manifest.icons as Array<{ src: string; sizes: string; purpose?: string }>;
      expect(icons).toBeDefined();
      expect(icons.length).toBeGreaterThanOrEqual(4);

      const icon192 = icons.find((i) => i.sizes === '192x192' && (!i.purpose || i.purpose === 'any'));
      const icon512 = icons.find((i) => i.sizes === '512x512' && (!i.purpose || i.purpose === 'any'));
      const maskable192 = icons.find((i) => i.sizes === '192x192' && i.purpose === 'maskable');
      const maskable512 = icons.find((i) => i.sizes === '512x512' && i.purpose === 'maskable');

      expect(icon192).toBeDefined();
      expect(icon512).toBeDefined();
      expect(maskable192).toBeDefined();
      expect(maskable512).toBeDefined();

      // Verify physical icon files exist on disk in public/
      expect(existsSync(resolve(process.cwd(), 'public', icon192!.src.replace(/^\//, '')))).toBe(true);
      expect(existsSync(resolve(process.cwd(), 'public', icon512!.src.replace(/^\//, '')))).toBe(true);
      expect(existsSync(resolve(process.cwd(), 'public', maskable192!.src.replace(/^\//, '')))).toBe(true);
      expect(existsSync(resolve(process.cwd(), 'public', maskable512!.src.replace(/^\//, '')))).toBe(true);
    });
  });

  describe('Service Worker Offline Assets & Precaching', () => {
    it('precaches Tesseract traineddata, manifest, HTML and uses versioned cache', () => {
      const swPath = resolve(process.cwd(), 'public/sw.js');
      expect(existsSync(swPath)).toBe(true);

      const swContent = readFileSync(swPath, 'utf-8');

      // Verify precached assets
      expect(swContent).toContain('/eng.traineddata');
      expect(swContent).toContain('/index.html');
      expect(swContent).toContain('/manifest.json');

      // Verify physical traineddata file exists in public/ for complete offline functionality
      expect(existsSync(resolve(process.cwd(), 'public/eng.traineddata'))).toBe(true);

      // Verify cache-first strategy and cache versioning
      expect(swContent).toContain('caches.match(req)');
      expect(swContent).toContain('CACHE_VERSION');
      expect(swContent).toContain('caches.delete');

      // Confirm user documents in IndexedDB are NEVER cached or touched
      expect(swContent).not.toContain('indexedDB.open');
      expect(swContent).not.toContain('openDB');
    });
  });

  describe('Service Worker Lifecycle: Dev vs Prod Registration', () => {
    it('does NOT register worker in development mode and unregisters any active worker', async () => {
      const unregisterMock = vi.fn().mockResolvedValue(true);
      const mockGetRegistrations = vi.fn().mockResolvedValue([
        { unregister: unregisterMock },
      ]);
      const mockRegister = vi.fn();

      const mockNavigator = {
        userAgent: 'test-agent',
        serviceWorker: {
          getRegistrations: mockGetRegistrations,
          register: mockRegister,
        },
      };

      Object.defineProperty(globalThis, 'navigator', {
        value: mockNavigator,
        configurable: true,
        writable: true,
      });

      (globalThis as any).window = {
        navigator: mockNavigator,
      };

      const result = await registerServiceWorker(false);
      expect(result).toBeNull();
      expect(mockRegister).not.toHaveBeenCalled();
      expect(mockGetRegistrations).toHaveBeenCalled();
    });

    it('registers /sw.js in production mode', async () => {
      const mockRegistration = {
        waiting: null,
        installing: null,
        addEventListener: vi.fn(),
      };
      const mockRegister = vi.fn().mockResolvedValue(mockRegistration);

      const mockNavigator = {
        userAgent: 'test-agent',
        serviceWorker: {
          register: mockRegister,
        },
      };

      Object.defineProperty(globalThis, 'navigator', {
        value: mockNavigator,
        configurable: true,
        writable: true,
      });

      (globalThis as any).window = {
        navigator: mockNavigator,
      };

      const callbacks = {
        onSuccess: vi.fn(),
        onUpdateAvailable: vi.fn(),
      };

      const result = await registerServiceWorker(true, callbacks);
      expect(result).toBe(mockRegistration);
      expect(mockRegister).toHaveBeenCalledWith('/sw.js');
    });

    it('notifies onUpdateAvailable when a worker is already waiting in production', async () => {
      const mockWaitingWorker = { postMessage: vi.fn() };
      const mockRegistration = {
        waiting: mockWaitingWorker,
        installing: null,
        addEventListener: vi.fn(),
      };
      const mockRegister = vi.fn().mockResolvedValue(mockRegistration);

      const mockNavigator = {
        userAgent: 'test-agent',
        serviceWorker: {
          register: mockRegister,
        },
      };

      Object.defineProperty(globalThis, 'navigator', {
        value: mockNavigator,
        configurable: true,
        writable: true,
      });

      (globalThis as any).window = {
        navigator: mockNavigator,
      };

      const onUpdateAvailable = vi.fn();
      await registerServiceWorker(true, { onUpdateAvailable });

      expect(onUpdateAvailable).toHaveBeenCalledWith(mockRegistration);
    });

    it('sends SKIP_WAITING and reloads on skipWaitingAndReload', () => {
      const postMessageMock = vi.fn();
      const mockReg = {
        waiting: { postMessage: postMessageMock },
      } as unknown as ServiceWorkerRegistration;

      const reloadMock = vi.fn();
      (globalThis as any).window = {
        location: { reload: reloadMock },
      };

      skipWaitingAndReload(mockReg);
      expect(postMessageMock).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
      expect(reloadMock).toHaveBeenCalled();
    });
  });

  describe('Install State & Standalone / iOS Detection Logic', () => {
    it('detects standalone display mode correctly', () => {
      const matchMediaMock = vi.fn().mockImplementation((query) => ({
        matches: query === '(display-mode: standalone)',
      }));

      (globalThis as any).window = {
        matchMedia: matchMediaMock,
        navigator: { standalone: false },
      };

      expect(isStandaloneMode()).toBe(true);

      matchMediaMock.mockReturnValue({ matches: false });
      (globalThis as any).window.navigator = { standalone: false };
      expect(isStandaloneMode()).toBe(false);

      (globalThis as any).window.navigator = { standalone: true };
      expect(isStandaloneMode()).toBe(true);
    });

    it('detects iOS devices (iPhone, iPad, iPod) for manual install dialog guidance', () => {
      const mockNavigator = {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
      };

      (globalThis as any).window = {
        navigator: mockNavigator,
      };

      expect(isIOSDevice()).toBe(true);

      mockNavigator.userAgent = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';
      expect(isIOSDevice()).toBe(true);

      mockNavigator.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36';
      expect(isIOSDevice()).toBe(false);
    });
  });
});
