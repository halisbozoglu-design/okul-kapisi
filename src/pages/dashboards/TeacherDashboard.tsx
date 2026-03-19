import { PageHeader } from '@/components/common/PageHeader';
import { StatCard } from '@/components/common/StatCard';
import { Users, BookOpen, ClipboardCheck, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function TeacherDashboard() {
  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Öğretmen Dashboard" description="Derslerinizi ve öğrencilerinizi takip edin" />
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Toplam Öğrenci" value={128} icon={Users} />
        <StatCard title="Haftalık Ders Saati" value={24} icon={Clock} />
        <StatCard title="Sınıf Sayısı" value={5} icon={BookOpen} />
        <StatCard title="Devamsızlık Oranı" value="%2.1" icon={ClipboardCheck} trend={{ value: 0.3, positive: true }} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-lg">Bugünkü Program</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[
              { time: '08:30 - 09:15', class: '10-A', subject: 'Matematik' },
              { time: '09:25 - 10:10', class: '11-B', subject: 'Matematik' },
              { time: '10:20 - 11:05', class: '9-C', subject: 'Geometri' },
              { time: '11:15 - 12:00', class: '12-A', subject: 'Matematik' },
            ].map((lesson, i) => (
              <div key={i} className="flex items-center gap-4 py-2 border-b last:border-0">
                <span className="text-sm font-mono text-muted-foreground w-32">{lesson.time}</span>
                <span className="text-sm font-medium">{lesson.class}</span>
                <span className="text-sm text-muted-foreground">{lesson.subject}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
