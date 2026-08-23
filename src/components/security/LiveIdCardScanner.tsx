import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { X, ScanLine, Loader2 } from 'lucide-react';
import {
  extractTcCandidates,
  maskTc,
  namesMatch,
  normalizeTrName,
} from '@/lib/security/tc';
import { recognizeCanvas } from '@/lib/security/ocr';

export interface IdScanResult {
  tc: string;
  fullName: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirmed: (result: IdScanResult) => void;
}

/** T.C. kimlik kartı oranı (ID-1): 85.60 x 53.98 mm */
const CARD_RATIO = 85.6 / 53.98;
const SCAN_INTERVAL_MS = 900;

function pickName(text: string): string {
  const lines = text
    .split('\n')
    .map((l) => normalizeTrName(l))
    .filter((l) => l.length >= 3 && l.split(' ').every((w) => w.length >= 2));
  const blacklist = ['TURKIYE', 'TÜRKİYE', 'CUMHURIYETI', 'CUMHURİYETİ', 'KIMLIK', 'KİMLİK', 'KARTI', 'REPUBLIC', 'IDENTITY', 'CARD', 'SURNAME', 'NAME', 'SOYADI', 'ADI'];
  const candidates = lines.filter((l) => !blacklist.some((b) => l.includes(b)));
  const two = candidates.filter((l) => l.split(' ').length >= 2);
  return (two[0] ?? candidates[0] ?? '').trim();
}

export function LiveIdCardScanner({ open, onClose, onConfirmed }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const busyRef = useRef(false);
  const lastRef = useRef<{ tc: string; name: string } | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState('Kimlik kartını çerçeve içine hizalayın');
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<IdScanResult | null>(null);
  const [physicalSeen, setPhysicalSeen] = useState(false);

  const cleanup = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    const c = canvasRef.current;
    if (c) {
      c.getContext('2d')?.clearRect(0, 0, c.width, c.height);
      c.width = 0;
      c.height = 0;
    }
    lastRef.current = null;
    busyRef.current = false;
  }, []);

  useEffect(() => {
    if (!open) {
      cleanup();
      setResult(null);
      setPhysicalSeen(false);
      setError(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
      } catch {
        setError('Kamera izni verilmedi veya kamera kullanılamıyor. Bilgileri elle girebilirsiniz.');
      }
    })();
    return () => {
      cancelled = true;
      cleanup();
    };
  }, [open, cleanup]);

  // Periyodik ROI OCR taraması
  useEffect(() => {
    if (!open || result || error) return;
    const id = window.setInterval(async () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || busyRef.current) return;
      if (!video.videoWidth || !video.videoHeight) return;
      busyRef.current = true;
      setScanning(true);
      try {
        // Yalnızca kart çerçevesinin (ROI) bulunduğu alan çizilir.
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        const roiW = Math.min(vw * 0.86, vh * 0.86 * CARD_RATIO);
        const roiH = roiW / CARD_RATIO;
        const sx = (vw - roiW) / 2;
        const sy = (vh - roiH) / 2;
        canvas.width = 900;
        canvas.height = Math.round(900 / CARD_RATIO);
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(video, sx, sy, roiW, roiH, 0, 0, canvas.width, canvas.height);

        const text = await recognizeCanvas(canvas);
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const tcs = extractTcCandidates(text);
        const name = pickName(text);
        if (!tcs.length) {
          setHint('Geçerli kimlik numarası okunamadı. Kartı sabit tutun, ışığı artırın.');
          lastRef.current = null;
          return;
        }
        const tc = tcs[0];
        const prev = lastRef.current;
        if (prev && prev.tc === tc && name && namesMatch(prev.name, name)) {
          setResult({ tc, fullName: name || prev.name });
        } else {
          lastRef.current = { tc, name };
          setHint('Okuma doğrulanıyor, kartı sabit tutun...');
        }
      } catch {
        setHint('Okuma başarısız. Kartı çerçeveye hizalayın.');
      } finally {
        busyRef.current = false;
        setScanning(false);
      }
    }, SCAN_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [open, result, error]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black">
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className="absolute inset-0 h-full w-full object-cover"
      />
      {/* OCR ROI canvas — asla görüntülenmez, kaydedilmez, gönderilmez */}
      <canvas ref={canvasRef} className="hidden" aria-hidden />

      {/* Karartma + kart çerçevesi */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
        <div className="absolute inset-0 bg-black/55" />
        <div
          className="relative w-[86vw] max-w-[520px] rounded-xl ring-2 ring-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]"
          style={{ aspectRatio: `${CARD_RATIO}` }}
        >
          {['-top-1 -left-1 border-t-4 border-l-4 rounded-tl-xl',
            '-top-1 -right-1 border-t-4 border-r-4 rounded-tr-xl',
            '-bottom-1 -left-1 border-b-4 border-l-4 rounded-bl-xl',
            '-bottom-1 -right-1 border-b-4 border-r-4 rounded-br-xl'].map((cls) => (
            <span key={cls} className={`absolute h-10 w-10 border-primary ${cls}`} />
          ))}
        </div>
      </div>

      <div className="absolute top-0 inset-x-0 p-4 flex items-start justify-between gap-3">
        <p className="text-white text-base font-medium drop-shadow">
          Kimlik kartını çerçeve içine hizalayın
        </p>
        <Button
          size="icon"
          variant="secondary"
          className="h-11 w-11 shrink-0"
          onClick={() => { cleanup(); onClose(); }}
          aria-label="Kapat"
        >
          <X className="h-5 w-5" />
        </Button>
      </div>

      <div className="absolute bottom-0 inset-x-0 p-4 space-y-3 bg-gradient-to-t from-black/85 to-transparent pt-16">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!result && !error && (
          <div className="flex items-center gap-2 text-white/90 text-sm">
            {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
            <span>{hint}</span>
          </div>
        )}

        {result && (
          <div className="rounded-xl bg-background p-4 space-y-3">
            <div>
              <p className="text-sm text-muted-foreground">Okunan kimlik</p>
              <p className="text-lg font-semibold">{result.fullName || 'Ad okunamadı'}</p>
              <p className="font-mono text-base tracking-wider">{maskTc(result.tc)}</p>
            </div>
            <label className="flex items-start gap-3 text-sm cursor-pointer min-h-[44px]">
              <Checkbox
                checked={physicalSeen}
                onCheckedChange={(v) => setPhysicalSeen(v === true)}
                className="mt-0.5"
              />
              <span>Kimliği fiziksel olarak gördüm ve kişiyle eşleştirdim</span>
            </label>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="h-12 flex-1"
                onClick={() => { setResult(null); setPhysicalSeen(false); lastRef.current = null; }}
              >
                Tekrar Oku
              </Button>
              <Button
                className="h-12 flex-1"
                disabled={!physicalSeen}
                onClick={() => { cleanup(); onConfirmed(result); }}
              >
                Devam Et
              </Button>
            </div>
          </div>
        )}

        {error && (
          <Button variant="secondary" className="h-12 w-full" onClick={() => { cleanup(); onClose(); }}>
            Kapat
          </Button>
        )}
      </div>
    </div>
  );
}
