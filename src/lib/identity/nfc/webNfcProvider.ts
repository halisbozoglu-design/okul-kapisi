import { NfcCapability, NfcProvider, NfcTagResult } from './types';

/**
 * Web NFC (Android Chrome) sağlayıcısı.
 * Yalnızca NDEF tag algılama yeteneğini test eder — kimlik kartı kişisel verisi okunmaz.
 */
export const webNfcProvider: NfcProvider = {
  id: 'web-ndef',
  capability(): NfcCapability {
    if (typeof window !== 'undefined' && 'NDEFReader' in window) return 'web_ndef_only';
    return 'unsupported';
  },
  async scanTag(signal?: AbortSignal): Promise<NfcTagResult> {
    if (this.capability() !== 'web_ndef_only') {
      return { ok: false, message: 'Bu cihaz/tarayıcı NFC taramayı desteklemiyor.' };
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const reader = new (window as any).NDEFReader();
      await reader.scan({ signal });
      const tagId = await new Promise<string | null>((resolve) => {
        const timer = setTimeout(() => resolve(null), 12000);
        reader.onreading = (event: { serialNumber?: string }) => {
          clearTimeout(timer);
          resolve(event.serialNumber ?? null);
        };
      });
      if (!tagId) return { ok: false, message: 'NFC etiketi algılanmadı.' };
      return {
        ok: true,
        tagId,
        message: 'NFC etiketi algılandı. Kimlik çipi verisi web üzerinden okunamaz.',
      };
    } catch (e) {
      return { ok: false, message: (e as Error)?.message || 'NFC taraması başarısız.' };
    }
  },
};
