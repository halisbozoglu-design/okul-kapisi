import { describe, it, expect } from 'vitest';
import {
  PWA_DISMISS_MS,
  isDismissalActive,
  isIosDevice,
  isIosNonSafari,
  isStandaloneDisplay,
  shouldShowInstallPrompt,
} from '@/lib/pwa';

const base = {
  standalone: false,
  installed: false,
  dismissedAt: null as string | null,
  mobileLike: true,
  canPrompt: true,
  ios: false,
};

describe('isDismissalActive', () => {
  const now = 1_000_000_000_000;
  it('false when no value or garbage', () => {
    expect(isDismissalActive(null, now)).toBe(false);
    expect(isDismissalActive('abc', now)).toBe(false);
  });
  it('true inside 7 day window', () => {
    expect(isDismissalActive(String(now - 1000), now)).toBe(true);
    expect(isDismissalActive(String(now - PWA_DISMISS_MS + 1), now)).toBe(true);
  });
  it('false after 7 days', () => {
    expect(isDismissalActive(String(now - PWA_DISMISS_MS), now)).toBe(false);
    expect(isDismissalActive(String(now - PWA_DISMISS_MS - 1), now)).toBe(false);
  });
});

describe('device detection', () => {
  it('detects iOS devices', () => {
    expect(isIosDevice('iPhone; CPU iPhone OS 17_0 like Mac OS X')).toBe(true);
    expect(isIosDevice('Macintosh; Intel Mac OS X', 5)).toBe(true);
    expect(isIosDevice('Macintosh; Intel Mac OS X', 0)).toBe(false);
    expect(isIosDevice('Linux; Android 13')).toBe(false);
  });
  it('detects non-Safari iOS browsers', () => {
    expect(isIosNonSafari('iPhone CriOS/120')).toBe(true);
    expect(isIosNonSafari('iPhone Version/17.0 Safari/605')).toBe(false);
  });
  it('detects standalone display', () => {
    const win = { navigator: { standalone: true }, matchMedia: () => ({ matches: false }) } as unknown as Window;
    expect(isStandaloneDisplay(win)).toBe(true);
    const win2 = { navigator: {}, matchMedia: () => ({ matches: true }) } as unknown as Window;
    expect(isStandaloneDisplay(win2)).toBe(true);
    const win3 = { navigator: {}, matchMedia: () => ({ matches: false }) } as unknown as Window;
    expect(isStandaloneDisplay(win3)).toBe(false);
  });
});

describe('shouldShowInstallPrompt', () => {
  it('shows on mobile with prompt available', () => {
    expect(shouldShowInstallPrompt(base)).toBe(true);
  });
  it('hides in standalone mode', () => {
    expect(shouldShowInstallPrompt({ ...base, standalone: true })).toBe(false);
  });
  it('hides when installed flag set', () => {
    expect(shouldShowInstallPrompt({ ...base, installed: true })).toBe(false);
  });
  it('hides on desktop', () => {
    expect(shouldShowInstallPrompt({ ...base, mobileLike: false })).toBe(false);
  });
  it('hides during 7 day dismissal', () => {
    const now = 2_000_000;
    expect(shouldShowInstallPrompt({ ...base, dismissedAt: String(now - 1000), now })).toBe(false);
    expect(shouldShowInstallPrompt({ ...base, dismissedAt: String(now - PWA_DISMISS_MS - 1), now })).toBe(true);
  });
  it('shows on iOS without beforeinstallprompt', () => {
    expect(shouldShowInstallPrompt({ ...base, canPrompt: false, ios: true })).toBe(true);
    expect(shouldShowInstallPrompt({ ...base, canPrompt: false, ios: false })).toBe(false);
  });
});
