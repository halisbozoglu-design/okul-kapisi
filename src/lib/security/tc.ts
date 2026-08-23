/**
 * T.C. kimlik numarası yardımcıları.
 * Açık TC hiçbir zaman veritabanına yazılmaz; yalnızca deterministik hash ve son 4 hane saklanır.
 */

const TR_MAP: Record<string, string> = {
  İ: 'I', ı: 'i', Ş: 'S', ş: 's', Ğ: 'G', ğ: 'g', Ü: 'U', ü: 'u', Ö: 'O', ö: 'o', Ç: 'C', ç: 'c',
};

/** OCR çıktısını Türkçe karakterleri koruyarak sadeleştirir (büyük harf, tek boşluk). */
export function normalizeTrName(input: string): string {
  return input
    .replace(/[^\p{L}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleUpperCase('tr-TR');
}

/** Aksan/Türkçe karakterleri ASCII'ye indirger (karşılaştırma için). */
export function asciiFold(input: string): string {
  return input.replace(/[İıŞşĞğÜüÖöÇç]/g, (c) => TR_MAP[c] ?? c);
}

/** OCR metninden 11 haneli aday TC numaralarını çıkarır. */
export function extractTcCandidates(raw: string): string[] {
  const digits = raw.replace(/[OoDQ]/g, '0').replace(/[lI|]/g, '1');
  const matches = digits.match(/\d{11}/g) ?? [];
  return Array.from(new Set(matches)).filter(isValidTcKimlik);
}

/** Resmî T.C. kimlik numarası checksum doğrulaması. */
export function isValidTcKimlik(value: string): boolean {
  if (typeof value !== 'string') return false;
  const tc = value.trim();
  if (!/^\d{11}$/.test(tc)) return false;
  if (tc[0] === '0') return false;
  const d = tc.split('').map(Number);
  const oddSum = d[0] + d[2] + d[4] + d[6] + d[8];
  const evenSum = d[1] + d[3] + d[5] + d[7];
  const digit10 = (oddSum * 7 - evenSum) % 10;
  if (((digit10 + 10) % 10) !== d[9]) return false;
  const total = d.slice(0, 10).reduce((a, b) => a + b, 0);
  return total % 10 === d[10];
}

/** 12*******34 biçiminde maskeler. */
export function maskTc(tc: string): string {
  if (!/^\d{11}$/.test(tc)) return '***********';
  return `${tc.slice(0, 2)}*******${tc.slice(-2)}`;
}

export function tcLast4(tc: string): string {
  return /^\d{11}$/.test(tc) ? tc.slice(-4) : '';
}

/** Kurum bazlı deterministik hash girdisi (rainbow table zorlaştırma amaçlı namespace). */
export function tcHashInput(tc: string, institutionId: string): string {
  return `mimaros:v1:${institutionId}:${tc}`;
}

export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function hashTc(tc: string, institutionId: string): Promise<string> {
  return sha256Hex(tcHashInput(tc, institutionId));
}

/** İki ad-soyad okumasının yeterince eşleştiğini kontrol eder (stabilite için). */
export function namesMatch(a: string, b: string): boolean {
  const na = asciiFold(normalizeTrName(a));
  const nb = asciiFold(normalizeTrName(b));
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}
