import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, KeyRound, School } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/db';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export default function InviteAcceptPage() {
  const { user, loading } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const token = params.get('token')?.trim() ?? '';

  const returnPath = useMemo(
    () => `/invite/accept?token=${encodeURIComponent(token)}`,
    [token],
  );

  const accept = async () => {
    if (!token || token.length < 32) {
      toast.error('Davet bağlantısı geçersiz.');
      return;
    }
    setBusy(true);
    const { error } = await db.rpc('accept_institution_invite', { _invite_token: token });
    setBusy(false);
    if (error) {
      const message = error.message.includes('INVITE_EMAIL_MISMATCH')
        ? 'Bu davet farklı bir e-posta adresi için oluşturulmuş.'
        : error.message.includes('INVITE_NOT_ACTIVE')
          ? 'Bu davet kullanılmış, iptal edilmiş veya süresi dolmuş.'
          : `Davet kabul edilemedi: ${error.message}`;
      toast.error(message);
      return;
    }
    setAccepted(true);
    toast.success('Kurum üyeliğiniz ve rolünüz etkinleştirildi.');
  };

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" /></div>;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-xl bg-primary">
            <School className="h-8 w-8 text-primary-foreground" />
          </div>
          <CardTitle>MİMAROS Kurum Daveti</CardTitle>
          <CardDescription>Davet yalnız davetin gönderildiği e-posta ile giriş yapan kullanıcı tarafından kabul edilebilir.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!token && (
            <Alert variant="destructive">
              <AlertTitle>Geçersiz bağlantı</AlertTitle>
              <AlertDescription>Davet tokenı bulunamadı.</AlertDescription>
            </Alert>
          )}

          {token && !user && (
            <>
              <Alert>
                <KeyRound className="h-4 w-4" />
                <AlertTitle>Önce hesabınıza giriş yapın</AlertTitle>
                <AlertDescription>Davet bağlantısı giriş/kayıt işleminden sonra korunur ve bu sayfaya geri dönülür.</AlertDescription>
              </Alert>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button asChild><Link to={`/login?next=${encodeURIComponent(returnPath)}`}>Giriş Yap</Link></Button>
                <Button asChild variant="outline"><Link to={`/register?next=${encodeURIComponent(returnPath)}`}>Kayıt Ol</Link></Button>
              </div>
            </>
          )}

          {token && user && !accepted && (
            <>
              <Alert>
                <AlertTitle>Davet hazır</AlertTitle>
                <AlertDescription>Devam ettiğinizda kurum üyeliğiniz ve size atanmış tenant rolü sunucu tarafında etkinleştirilecek.</AlertDescription>
              </Alert>
              <Button className="w-full" onClick={() => void accept()} disabled={busy}>
                {busy ? 'Doğrulanıyor...' : 'Daveti Kabul Et'}
              </Button>
            </>
          )}

          {accepted && (
            <>
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertTitle>Davet kabul edildi</AlertTitle>
                <AlertDescription>Yeni kurum yetkileriniz bir sonraki erişim bağlamında aktif olacaktır.</AlertDescription>
              </Alert>
              <Button className="w-full" onClick={() => navigate('/dashboard', { replace: true })}>MİMAROS'a Geç</Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
