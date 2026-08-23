import { describe, expect, it } from 'vitest';
import { extractTcCandidates, isValidTcKimlik, maskTc, namesMatch, normalizeTrName, tcLast4 } from '@/lib/security/tc';

// Checksum'a uygun test numaraları
const VALID = '10000000146';

describe('T.C. kimlik checksum', () => {
  it('geçerli numarayı kabul eder', () => {
    expect(isValidTcKimlik(VALID)).toBe(true);
  });

  it('0 ile başlayanı reddeder', () => {
    expect(isValidTcKimlik('01234567890')).toBe(false);
  });

  it('yanlış uzunluk / harf reddedilir', () => {
    expect(isValidTcKimlik('1234567890')).toBe(false);
    expect(isValidTcKimlik('1234567890a')).toBe(false);
    expect(isValidTcKimlik('')).toBe(false);
  });

  it('checksum bozulduğunda reddeder', () => {
    const broken = `${VALID.slice(0, 10)}${(Number(VALID[10]) + 1) % 10}`;
    expect(isValidTcKimlik(broken)).toBe(false);
  });

  it('tüm aynı rakam gibi rastgele değerleri kabul etmez', () => {
    expect(isValidTcKimlik('11111111111')).toBe(false);
  });
});

describe('maskeleme', () => {
  it('12*******34 biçiminde maskeler', () => {
    expect(maskTc(VALID)).toBe(`${VALID.slice(0, 2)}*******${VALID.slice(-2)}`);
    expect(maskTc(VALID)).toHaveLength(11);
  });
  it('son 4 haneyi verir', () => {
    expect(tcLast4(VALID)).toBe(VALID.slice(-4));
  });
});

describe('OCR yardımcıları', () => {
  it('metinden yalnız geçerli TC adaylarını çıkarır', () => {
    const text = `TURKIYE CUMHURIYETI\n${VALID}\n12345678901`;
    expect(extractTcCandidates(text)).toEqual([VALID]);
  });

  it('Türkçe adı normalize eder', () => {
    expect(normalizeTrName(' çiğdem  şahin1 ')).toBe('ÇİĞDEM ŞAHİN');
  });

  it('ad eşleşmesini tolere eder', () => {
    expect(namesMatch('AYŞE YILMAZ', 'ayşe yılmaz')).toBe(true);
    expect(namesMatch('AYŞE YILMAZ', 'MEHMET DEMIR')).toBe(false);
  });
});
