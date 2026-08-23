import { webNfcProvider } from './webNfcProvider';
import { NativeIdentityNfcBridge, NfcCapability, NfcProvider } from './types';

export * from './types';
export { webNfcProvider };

let nativeBridge: NativeIdentityNfcBridge | null = null;

/** Capacitor plugin yüklendiğinde uygulama açılışında çağrılır. */
export function registerNativeNfcBridge(bridge: NativeIdentityNfcBridge) {
  nativeBridge = bridge;
}

export function getNativeNfcBridge(): NativeIdentityNfcBridge | null {
  return nativeBridge;
}

export function getNfcProvider(): NfcProvider {
  return webNfcProvider;
}

export function getNfcCapability(): NfcCapability {
  if (nativeBridge) return 'native_iso7816';
  return webNfcProvider.capability();
}

export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function nfcCapabilityMessage(): string {
  const cap = getNfcCapability();
  if (cap === 'native_iso7816') return 'Kimlik çipi okuma hazır (mobil uygulama).';
  if (cap === 'web_ndef_only') {
    return 'Bu tarayıcı yalnızca NFC etiketi algılayabilir. Kimlik çipi verisi okunamaz.';
  }
  if (isIos()) return 'NFC kimlik çipi için MİMAROS mobil uygulaması gerekir.';
  return 'Bu cihazda NFC desteklenmiyor. Kamera ile kimlik okumayı kullanın.';
}
