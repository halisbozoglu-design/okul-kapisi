import { PageHeader } from '@/components/common/PageHeader';
import { StatCard } from '@/components/common/StatCard';
import { GraduationCap, ClipboardCheck, TrendingUp, Bell } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function ParentDashboard() {
  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Veli Dashboard" description="Çocuğunuzun eğitim durumunu takip edin" />
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Genel Ortalama" value="82.5" icon={TrendingUp} trend={{ value: 3, positive: true }} />
        <StatCard title="Devamsızlık" value="2 gün" icon={ClipboardCheck} />
        <StatCard title="Sınıf" value="10-A" icon={GraduationCap} />
        <StatCard title="Bildirimler" value={5} icon={Bell} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-lg">Son Sınav Sonuçları</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[
              { subject: 'Matematik', score: 85, date: '15 Mart 2026' },
              { subject: 'Fizik', score: 78, date: '14 Mart 2026' },
              { subject: 'Türkçe', score: 92, date: '13 Mart 2026' },
              { subject: 'İngilizce', score: 88, date: '12 Mart 2026' },
            ].map((exam, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
                <span className="text-sm font-medium">{exam.subject}</span>
                <div className="flex items-center gap-4">
                  <span className="text-sm font-bold">{exam.score}</span>
                  <span className="text-xs text-muted-foreground">{exam.date}</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
