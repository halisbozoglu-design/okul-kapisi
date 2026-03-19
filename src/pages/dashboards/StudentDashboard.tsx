import { PageHeader } from '@/components/common/PageHeader';
import { StatCard } from '@/components/common/StatCard';
import { TrendingUp, ClipboardCheck, BookOpen, CalendarDays } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function StudentDashboard() {
  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Öğrenci Dashboard" description="Eğitim sürecinizi takip edin" />
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Genel Ortalama" value="82.5" icon={TrendingUp} trend={{ value: 3, positive: true }} />
        <StatCard title="Devamsızlık" value="2 gün" icon={ClipboardCheck} />
        <StatCard title="Ders Sayısı" value={12} icon={BookOpen} />
        <StatCard title="Yaklaşan Sınav" value={3} icon={CalendarDays} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-lg">Bugünkü Ders Programı</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[
              { time: '08:30 - 09:15', subject: 'Matematik', teacher: 'Ahmet Hoca' },
              { time: '09:25 - 10:10', subject: 'Fizik', teacher: 'Mehmet Hoca' },
              { time: '10:20 - 11:05', subject: 'Türkçe', teacher: 'Ayşe Hoca' },
              { time: '11:15 - 12:00', subject: 'İngilizce', teacher: 'Fatma Hoca' },
            ].map((lesson, i) => (
              <div key={i} className="flex items-center gap-4 py-2 border-b last:border-0">
                <span className="text-sm font-mono text-muted-foreground w-32">{lesson.time}</span>
                <span className="text-sm font-medium">{lesson.subject}</span>
                <span className="text-sm text-muted-foreground">{lesson.teacher}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
