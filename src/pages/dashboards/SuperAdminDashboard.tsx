import { PageHeader } from '@/components/common/PageHeader';
import { StatCard } from '@/components/common/StatCard';
import { Users, Building2, GraduationCap, BookOpen, School, Shield } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function SuperAdminDashboard() {
  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Süper Admin Dashboard" description="Sistem genelini yönetin" />
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Toplam Kurum" value={3} icon={Building2} trend={{ value: 12, positive: true }} />
        <StatCard title="Toplam Kullanıcı" value={1248} icon={Users} trend={{ value: 8, positive: true }} />
        <StatCard title="Toplam Öğrenci" value={856} icon={GraduationCap} description="Aktif öğrenci sayısı" />
        <StatCard title="Toplam Öğretmen" value={94} icon={BookOpen} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Son Aktiviteler</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { text: 'Yeni kurum eklendi: ABC Koleji', time: '2 saat önce' },
                { text: '15 yeni öğrenci kaydı yapıldı', time: '4 saat önce' },
                { text: 'Akademik yıl güncellendi', time: '1 gün önce' },
                { text: '3 yeni öğretmen atandı', time: '2 gün önce' },
              ].map((item, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
                  <span className="text-sm">{item.text}</span>
                  <span className="text-xs text-muted-foreground">{item.time}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Kurumlar</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { name: 'ABC Koleji', students: 420, teachers: 35 },
                { name: 'XYZ Lisesi', students: 280, teachers: 28 },
                { name: 'Demo Okulu', students: 156, teachers: 31 },
              ].map((inst, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div className="flex items-center gap-2">
                    <School className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">{inst.name}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>{inst.students} öğrenci</span>
                    <span>{inst.teachers} öğretmen</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
