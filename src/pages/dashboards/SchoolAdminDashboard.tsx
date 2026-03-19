import { PageHeader } from '@/components/common/PageHeader';
import { StatCard } from '@/components/common/StatCard';
import { Users, GraduationCap, BookOpen, CalendarDays, ClipboardCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function SchoolAdminDashboard() {
  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Okul Yönetimi Dashboard" description="Okulunuzu yönetin" />
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Öğrenci Sayısı" value={420} icon={GraduationCap} trend={{ value: 5, positive: true }} />
        <StatCard title="Öğretmen Sayısı" value={35} icon={BookOpen} />
        <StatCard title="Devamsızlık" value="%3.2" icon={ClipboardCheck} trend={{ value: 0.5, positive: false }} />
        <StatCard title="Aktif Dönem" value="2025-2026 / 2" icon={CalendarDays} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-lg">Sınıf Dağılımı</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {['9. Sınıf', '10. Sınıf', '11. Sınıf', '12. Sınıf'].map((grade, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
                  <span className="text-sm font-medium">{grade}</span>
                  <span className="text-sm text-muted-foreground">{[120, 110, 105, 85][i]} öğrenci</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-lg">Yaklaşan Etkinlikler</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { title: 'Veli Toplantısı', date: '25 Mart 2026' },
                { title: 'Ara Sınav Dönemi', date: '1-15 Nisan 2026' },
                { title: 'Bilim Fuarı', date: '20 Nisan 2026' },
              ].map((event, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
                  <span className="text-sm">{event.title}</span>
                  <span className="text-xs text-muted-foreground">{event.date}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
