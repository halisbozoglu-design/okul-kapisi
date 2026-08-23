/** Registers the offline-shell service worker (production builds only). */
export function registerServiceWorker() {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;
  if (!import.meta.env.PROD) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('Service worker kaydı başarısız', err);
    });
  });
}

/* ------------------------------------------------------------------ */
/* Install prompt helpers (pure & testable)                            */
/* ------------------------------------------------------------------ */

export const PWA_DISMISS_KEY = 'mimaros.pwa.installPromptDismissedAt';
export const PWA_INSTALLED_KEY = 'mimaros.pwa.installed';
export const PWA_DISMISS_DAYS = 7;
export const PWA_DISMISS_MS = PWA_DISMISS_DAYS * 24 * 60 * 60 * 1000;

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** True when the dismissal timestamp is still inside the 7 day window. */
export function isDismissalActive(
  storedValue: string | null,
  now: number = Date.now(),
  windowMs: number = PWA_DISMISS_MS,
): boolean {
  if (!storedValue) return false;
  const ts = Number(storedValue);
  if (!Number.isFinite(ts) || ts <= 0) return false;
  if (ts > now) return true; // clock skew: treat future stamps as active
  return now - ts < windowMs;
}

/** True when running as an installed app (standalone display / iOS webapp). */
export function isStandaloneDisplay(win: Window | undefined = typeof window !== 'undefined' ? window : undefined): boolean {
  if (!win) return false;
  const nav = win.navigator as Navigator & { standalone?: boolean };
  if (nav?.standalone === true) return true;
  try {
    return win.matchMedia?.('(display-mode: standalone)')?.matches === true;
  } catch {
    return false;
  }
}

/** iOS (iPhone/iPad/iPod) detection, including iPadOS desktop-mode UA. */
export function isIosDevice(userAgent: string, maxTouchPoints = 0): boolean {
  if (/iPad|iPhone|iPod/i.test(userAgent)) return true;
  return /Macintosh/i.test(userAgent) && maxTouchPoints > 1;
}

/** True for iOS browsers that are not Safari (no Add to Home Screen support). */
export function isIosNonSafari(userAgent: string): boolean {
  return /CriOS|FxiOS|EdgiOS|OPiOS|Chrome/i.test(userAgent);
}

/** Phone/tablet-ish surface: coarse pointer or narrow viewport. */
export function isMobileLikeViewport(win: Window | undefined = typeof window !== 'undefined' ? window : undefined): boolean {
  if (!win) return false;
  let coarse = false;
  try {
    coarse = win.matchMedia?.('(pointer: coarse)')?.matches === true;
  } catch {
    coarse = false;
  }
  return coarse || (win.innerWidth ?? 0) <= 820;
}

export interface InstallPromptVisibilityInput {
  standalone: boolean;
  installed: boolean;
  dismissedAt: string | null;
  mobileLike: boolean;
  canPrompt: boolean;
  ios: boolean;
  now?: number;
}

/** Single source of truth for whether the install card should render. */
export function shouldShowInstallPrompt(input: InstallPromptVisibilityInput): boolean {
  if (input.standalone) return false;
  if (input.installed) return false;
  if (!input.mobileLike) return false;
  if (isDismissalActive(input.dismissedAt, input.now)) return false;
  return input.canPrompt || input.ios;
}

export function readDismissedAt(storage?: Pick<Storage, 'getItem'>): string | null {
  const s = storage ?? safeStorage();
  try {
    return s?.getItem(PWA_DISMISS_KEY) ?? null;
  } catch {
    return null;
  }
}

export function writeDismissedAt(now: number = Date.now(), storage?: Pick<Storage, 'setItem'>) {
  const s = storage ?? safeStorage();
  try {
    s?.setItem(PWA_DISMISS_KEY, String(now));
  } catch {
    /* ignore */
  }
}

export function isInstalledFlagSet(storage?: Pick<Storage, 'getItem'>): boolean {
  const s = storage ?? safeStorage();
  try {
    return s?.getItem(PWA_INSTALLED_KEY) === '1';
  } catch {
    return false;
  }
}

export function markInstalled(storage?: Pick<Storage, 'setItem'>) {
  const s = storage ?? safeStorage();
  try {
    s?.setItem(PWA_INSTALLED_KEY, '1');
  } catch {
    /* ignore */
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}
