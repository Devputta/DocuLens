/**
 * Hook for managing PWA installation states, beforeinstallprompt event,
 * standalone mode detection, iOS Safari instructions, and service worker update notifications.
 */

import { useState, useEffect, useCallback } from 'react';
import { registerServiceWorker, skipWaitingAndReload } from '../services/serviceWorkerRegistration';

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export interface UsePWAInstallReturn {
  isInstallable: boolean;
  isInstalled: boolean;
  isIOS: boolean;
  install: () => Promise<boolean>;
  updateAvailable: boolean;
  reloadApp: () => void;
}

export function isStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false;
  const isDisplayStandalone = window.matchMedia('(display-mode: standalone)').matches;
  const isNavStandalone = (window.navigator as any)?.standalone === true;
  return Boolean(isDisplayStandalone || isNavStandalone);
}

export function isIOSDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator || (typeof navigator !== 'undefined' ? navigator : null);
  if (!nav || !nav.userAgent) return false;
  const ua = nav.userAgent.toLowerCase();
  const isIOSPlatform = /iphone|ipad|ipod/.test(ua);
  const isIPadOS = /macintosh/.test(ua) && typeof nav.maxTouchPoints === 'number' && nav.maxTouchPoints > 1;
  return isIOSPlatform || isIPadOS;
}

export function usePWAInstall(): UsePWAInstallReturn {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(false);
  const [isIOS, setIsIOS] = useState<boolean>(false);
  const [updateAvailable, setUpdateAvailable] = useState<boolean>(false);
  const [waitingRegistration, setWaitingRegistration] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    setIsInstalled(isStandaloneMode());
    setIsIOS(isIOSDevice());

    // Listen for beforeinstallprompt (Chrome, Edge, Android)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    // Listen for appinstalled
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    // Register service worker in production
    const isProd = typeof import.meta !== 'undefined' ? import.meta.env?.PROD : false;
    registerServiceWorker(isProd, {
      onUpdateAvailable: (reg) => {
        setWaitingRegistration(reg);
        setUpdateAvailable(true);
      },
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const install = useCallback(async (): Promise<boolean> => {
    if (!deferredPrompt) {
      return false;
    }

    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice && choice.outcome === 'accepted') {
        setIsInstalled(true);
        setDeferredPrompt(null);
        return true;
      }
      return false;
    } catch (err) {
      console.debug('Install prompt notice:', err);
      return false;
    }
  }, [deferredPrompt]);

  const reloadApp = useCallback(() => {
    if (waitingRegistration) {
      skipWaitingAndReload(waitingRegistration);
    } else if (typeof window !== 'undefined') {
      window.location.reload();
    }
  }, [waitingRegistration]);

  return {
    isInstallable: Boolean(deferredPrompt && !isInstalled),
    isInstalled,
    isIOS,
    install,
    updateAvailable,
    reloadApp,
  };
}
