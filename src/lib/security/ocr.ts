/**
 * Cihaz üstü (client-side) OCR sarmalayıcısı.
 * Worker bir kez oluşturulur, tekrar kullanılır. Görüntü hiçbir yere gönderilmez.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Worker = any;

let workerPromise: Promise<Worker> | null = null;

export async function getOcrWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import('tesseract.js');
      return createWorker('tur');
    })();
  }
  return workerPromise;
}

export async function recognizeCanvas(canvas: HTMLCanvasElement): Promise<string> {
  const worker = await getOcrWorker();
  const { data } = await worker.recognize(canvas);
  return (data?.text as string) ?? '';
}

export async function terminateOcrWorker(): Promise<void> {
  if (!workerPromise) return;
  const p = workerPromise;
  workerPromise = null;
  try {
    const worker = await p;
    await worker.terminate();
  } catch {
    /* yoksay */
  }
}
