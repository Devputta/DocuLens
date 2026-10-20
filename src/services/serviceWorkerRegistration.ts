/**
 * Service Worker Registration & Lifecycle Management
 * - In production: registers /sw.js to support offline capabilities and PWA.
 * - In development: does NOT register / cache anything, ensuring dev server never caches.
 * - Detects service worker updates and provides a callback when an update is waiting.
 */

export interface SWRegistrationCallbacks {
  onUpdateAvailable?: (registration: ServiceWorkerRegistration) => void;
  onSuccess?: (registration: ServiceWorkerRegistration) => void;
  onError?: (error: Error) => void;
}

export function registerServiceWorker(
  isProd: boolean = typeof import.meta !== 'undefined' ? import.meta.env?.PROD : false,
  callbacks?: SWRegistrationCallbacks
): Promise<ServiceWorkerRegistration | null> {
  // Confirm the production build registers the worker, and that the dev server doesn't cache anything
  if (!isProd) {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      // If any existing service worker is registered in dev mode, unregister it
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const reg of registrations) {
          reg.unregister();
        }
      });
    }
    return Promise.resolve(null);
  }

  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return Promise.resolve(null);
  }

  return navigator.serviceWorker
    .register('/sw.js')
    .then((registration) => {
      // 1. Check if an updated worker is already waiting
      if (registration.waiting) {
        callbacks?.onUpdateAvailable?.(registration);
      }

      // 2. Listen for newly discovered workers transitioning to waiting
      registration.addEventListener('updatefound', () => {
        const installingWorker = registration.installing;
        if (!installingWorker) return;

        installingWorker.addEventListener('statechange', () => {
          if (installingWorker.state === 'installed') {
            if (navigator.serviceWorker.controller) {
              // New content is available and waiting
              callbacks?.onUpdateAvailable?.(registration);
            } else {
              // Content is cached for offline use
              callbacks?.onSuccess?.(registration);
            }
          }
        });
      });

      return registration;
    })
    .catch((error) => {
      console.debug('Service worker registration status:', error);
      callbacks?.onError?.(error);
      return null;
    });
}

/**
 * Tells the waiting service worker to activate and reloads the page.
 */
export function skipWaitingAndReload(registration: ServiceWorkerRegistration): void {
  if (registration && registration.waiting) {
    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
  }
  if (typeof window !== 'undefined') {
    window.location.reload();
  }
}
