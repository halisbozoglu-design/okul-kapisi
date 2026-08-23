/**
 * NFC kimlik okuma soyutlaması.
 * ÖNEMLİ: Web katmanı yalnızca NDEF tag yeteneğini test eder.
 * T.C. kimlik kartının ISO7816 çip verisi web tarayıcıdan OKUNAMAZ ve okunduğu iddia edilmez.
 */

export type NfcCapability = 'unsupported' | 'web_ndef_only' | 'native_iso7816';

export interface NfcTagResult {
  ok: boolean;
  /** Yalnızca tag tespit/serial gibi kişisel olmayan bilgi. */
  tagId?: string | null;
  message: string;
}

export interface NfcProvider {
  readonly id: string;
  capability(): NfcCapability;
  scanTag(signal?: AbortSignal): Promise<NfcTagResult>;
}

/** Capacitor/native köprüsünün ileride uygulayacağı tipli arayüz. */
export interface NativeIdentityNfcBridge {
  /** iOS CoreNFC / Android IsoDep üzerinden kimlik çipi oturumu. */
  readIdCard(params: { can?: string; birthDate?: string; expiryDate?: string }): Promise<{
    ok: boolean;
    tcNo?: string;
    firstName?: string;
    lastName?: string;
    error?: string;
  }>;
  isAvailable(): Promise<boolean>;
}
