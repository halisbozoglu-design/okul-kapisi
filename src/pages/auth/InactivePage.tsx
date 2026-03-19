import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ShieldX } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

export default function InactivePage() {
  const { signOut } = useAuth();
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="flex justify-center mb-4">
            <ShieldX className="h-16 w-16 text-destructive" />
          </div>
          <CardTitle>Hesap Pasif</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            Hesabınız şu anda pasif durumda. Lütfen yöneticinize başvurun.
          </p>
          <Button variant="outline" onClick={signOut}>Çıkış Yap</Button>
        </CardContent>
      </Card>
    </div>
  );
}
