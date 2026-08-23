import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ db: {} }));

const scannerSource = readFileSync(
  resolve(process.cwd(), 'src/components/security/LiveIdCardScanner.tsx'),
  'utf8',
);

describe('kamera tarayıcı görüntü kalıcılığı yasağı', () => {
  it('canvas görüntüsünü dışa aktaran API kullanmaz', () => {
    expect(scannerSource).not.toMatch(/toDataURL/);
    expect(scannerSource).not.toMatch(/toBlob/);
    expect(scannerSource).not.toMatch(/captureStream/);
    expect(scannerSource).not.toMatch(/new File\(/);
  });

  it('herhangi bir ağ/upload çağrısı içermez', () => {
    expect(scannerSource).not.toMatch(/fetch\(/);
    expect(scannerSource).not.toMatch(/XMLHttpRequest/);
    expect(scannerSource).not.toMatch(/\.upload\(/);
    expect(scannerSource).not.toMatch(/supabase/i);
  });

  it('kapanista kamera akislarini durdurur ve canvasi temizler', () => {
    expect(scannerSource).toMatch(/getTracks\(\)\.forEach\(\(t\) => t\.stop\(\)\)/);
    expect(scannerSource).toMatch(/clearRect/);
  });
});

describe('fiziksel kimlik kuralı', () => {
  it('physical_id_seen=false ise ziyaret oluşturulamaz', async () => {
    const { createVisit } = await import('@/lib/security/visitors');
    await expect(
      createVisit({
        institutionId: 'i1',
        visitorPersonId: 'p1',
        entryLocationId: 'l1',
        physicalIdSeen: false,
        identityMethod: 'manual',
        operatorProfileId: 'pr1',
      }),
    ).rejects.toThrow(/Fiziksel kimlik/);
  });
});
