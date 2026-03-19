import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { UserX } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

export default function NoRolePage() {
  const { signOut } = useAuth();
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="flex justify-center mb-4">
            <UserX className="h-16 w-16 text-warning" />
          </div>
          <CardTitle>Rol Atanmamış</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            Hesabınıza henüz bir rol atanmamış. Lütfen yöneticinize başvurun.
          </p>
          <Button variant="outline" onClick={signOut}>Çıkış Yap</Button>
        </CardContent>
      </Card>
    </div>
  );
}
