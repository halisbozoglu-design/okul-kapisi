import { useCallback, useEffect, useState } from 'react';
import { X, Share, Plus, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  clearDeferredInstallEvent,
  getDeferredInstallEvent,
  isInstalledFlagSet,
  isIosDevice,
  isIosNonSafari,
  isMobileLikeViewport,
  isStandaloneDisplay,
  markInstalled,
  readDismissedAt,
  shouldShowInstallPrompt,
  subscribeInstallState,
  wasAppInstalled,
  writeDismissedAt,
} from '@/lib/pwa';

/**
 * Kompakt "Ana ekrana ekle" kurulum kartı.
 * Sadece mobil/tablet yüzeylerde, standalone değilken ve 7 günlük
 * reddetme penceresi dışında görünür.
 * beforeinstallprompt event'i main.tsx'te global olarak yakalanır; burada
 * yalnızca yakalanmış durum okunur (erken tetiklenen event kaçmaz).
 */
export function PwaInstallPrompt() {
  const [canPrompt, setCanPrompt] = useState(() => getDeferredInstallEvent() !== null);
  const [installed, setInstalled] = useState(() => isInstalledFlagSet() || wasAppInstalled());
  const [dismissedAt, setDismissedAt] = useState<string | null>(() => readDismissedAt());
  const [showIosHelp, setShowIosHelp] = useState(false);

  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const maxTouch = typeof navigator !== 'undefined' ? navigator.maxTouchPoints ?? 0 : 0;
  const ios = isIosDevice(ua, maxTouch);
  const iosNonSafari = ios && isIosNonSafari(ua);

  useEffect(() => {
    const sync = () => {
      setCanPrompt(getDeferredInstallEvent() !== null);
      if (wasAppInstalled() || isInstalledFlagSet()) setInstalled(true);
    };
    sync();
    return subscribeInstallState(sync);
  }, []);

  const handleDismiss = useCallback(() => {
    const now = Date.now();
    writeDismissedAt(now);
    setDismissedAt(String(now));
  }, []);

  const handleInstall = useCallback(async () => {
    const evt = getDeferredInstallEvent();
    if (!evt) return;
    try {
      await evt.prompt();
      const choice = await evt.userChoice;
      if (choice.outcome === 'accepted') {
        markInstalled();
        setInstalled(true);
      } else {
        handleDismiss();
      }
    } catch {
      /* kullanıcı prompt'u iptal etti */
    } finally {
      clearDeferredInstallEvent();
      setCanPrompt(false);
    }
  }, [handleDismiss]);


  const visible = shouldShowInstallPrompt({
    standalone: isStandaloneDisplay(),
    installed,
    dismissedAt,
    mobileLike: isMobileLikeViewport(),
    canPrompt,
    ios,
  });

  if (!visible) return null;

  return (
    <div
      className="fixed inset-x-3 bottom-3 z-50 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:max-w-sm"
      role="region"
      aria-label="Uygulama kurulum önerisi"
    >
      <Card className="relative border-border/80 p-4 shadow-lg">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Kurulum önerisini kapat"
          onClick={handleDismiss}
          className="absolute right-1 top-1 h-11 w-11"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>

        <div className="flex items-start gap-3 pr-10">
          <div className="mt-0.5 rounded-md bg-primary/10 p-2 text-primary">
            <Smartphone className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-snug">
              MİMAROS'u telefonunuzun ana ekranına ekleyin
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Daha hızlı erişim için uygulamayı ana ekranınıza ekleyin.
            </p>
          </div>
        </div>

        {showIosHelp && (
          <div className="mt-3 rounded-md border bg-muted/50 p-3 text-xs text-muted-foreground">
            <p className="flex flex-wrap items-center gap-1 text-foreground">
              Safari'de
              <Share className="h-3.5 w-3.5" aria-hidden="true" />
              Paylaş simgesine dokunun →
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Ana Ekrana Ekle → Ekle
            </p>
            {iosNonSafari && (
              <p className="mt-2">
                Bu tarayıcıda ana ekrana ekleme desteklenmez. Lütfen sayfayı Safari ile açın.
              </p>
            )}
          </div>
        )}

        <div className="mt-3 flex justify-end gap-2">
          {canPrompt ? (
            <Button
              type="button"
              size="sm"
              className="min-h-11"
              onClick={handleInstall}
              aria-label="Uygulamayı ana ekrana ekle"
            >
              Ana Ekrana Ekle
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="min-h-11"
              aria-expanded={showIosHelp}
              aria-label="Ana ekrana nasıl eklenir"
              onClick={() => setShowIosHelp((v) => !v)}
            >
              Nasıl eklenir?
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}

export default PwaInstallPrompt;
