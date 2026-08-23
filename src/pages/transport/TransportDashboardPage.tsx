import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { PageHeader } from '@/components/common/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Bus, Route as RouteIcon, Users, Radio, Smartphone, FlaskConical, CalendarOff } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/db';
import { useInstitution } from '@/hooks/useInstitution';
import { ABSENCE_DIRECTION_LABELS, TransportAbsence, toDateKey } from '@/lib/transport/absences';

interface AbsenceRow extends TransportAbsence {
  students?: { first_name: string; last_name: string; student_no: string | null } | null;
}

interface Stats { vehicles: number; routes: number; students: number; activeTrips: number }

export default function TransportDashboardPage() {
  const { institutionId } = useInstitution();
  const [stats, setStats] = useState<Stats>({ vehicles: 0, routes: 0, students: 0, activeTrips: 0 });
  const [retention, setRetention] = useState('30');
  const [interval, setIntervalValue] = useState('8');
  const [seeding, setSeeding] = useState(false);
  const [absences, setAbsences] = useState<AbsenceRow[]>([]);

  const loadStats = async () => {
    const count = async (table: string, filters: Record<string, string> = {}) => {
      let q = db.from(table).select('id', { count: 'exact', head: true }).is('deleted_at', null);
      Object.entries(filters).forEach(([k, v]) => { q = q.eq(k, v); });
      const { count: c } = await q;
      return c ?? 0;
    };
    setStats({
      vehicles: await count('vehicles'),
      routes: await count('routes'),
      students: await count('students'),
      activeTrips: await count('transport_trips', { status: 'active' }),
    });
  };

  useEffect(() => {
    loadStats();
    const loadSettings = async () => {
      if (!institutionId) return;
      const { data } = await db.from('transport_settings').select('*').eq('institution_id', institutionId).maybeSingle();
      if (data) {
        setRetention(String(data.location_retention_days));
        setIntervalValue(String(data.ping_interval_seconds));
      }
    };
    loadSettings();
    const loadAbsences = async () => {
      const { data } = await db.from('transport_absences')
        .select('id, institution_id, student_id, absence_date, direction, reason, cancelled_at, deleted_at, created_at, students(first_name, last_name, student_no)')
        .gte('absence_date', toDateKey(new Date()))
        .is('cancelled_at', null)
        .is('deleted_at', null)
        .order('absence_date', { ascending: true })
        .limit(50);
      setAbsences((data || []) as AbsenceRow[]);
    };
    loadAbsences();
  }, [institutionId]);

  const saveSettings = async () => {
    if (!institutionId) { toast.error('Kurum bulunamadı'); return; }
    const { error } = await db.from('transport_settings').upsert({
      institution_id: institutionId,
      location_retention_days: Number(retention) || 30,
      ping_interval_seconds: Number(interval) || 8,
    }, { onConflict: 'institution_id' });
    if (error) { toast.error(error.message); return; }
    toast.success('Ayarlar kaydedildi');
  };

  const seedDemo = async () => {
    if (!institutionId) { toast.error('Kurum bulunamadı'); return; }
    setSeeding(true);
    try {
      const { data: vehicle, error: ve } = await db.from('vehicles').insert({
        institution_id: institutionId, service_no: 'DEMO-1', plate: '34 DEMO 01',
        brand: 'Mercedes', model: 'Sprinter', capacity: 16, is_demo: true,
      }).select('id').single();
      if (ve) throw ve;

      const { data: route, error: re } = await db.from('routes').insert({
        institution_id: institutionId, name: 'Demo Hat - Merkez', code: 'DEMO-H1',
        direction: 'both', vehicle_id: vehicle.id, is_demo: true,
      }).select('id').single();
      if (re) throw re;

      const stops = ['Demo Durak 1', 'Demo Durak 2', 'Okul'].map((name, i) => ({
        institution_id: institutionId, route_id: route.id, name, order_index: i + 1,
        lat: 39.92 + i * 0.01, lng: 32.85 + i * 0.01,
      }));
      const { data: stopRows, error: se } = await db.from('route_stops').insert(stops).select('id');
      if (se) throw se;

      const students = [
        { first_name: 'Demo', last_name: 'Öğrenci 1', student_no: 'D-001' },
        { first_name: 'Demo', last_name: 'Öğrenci 2', student_no: 'D-002' },
      ].map(s => ({ ...s, institution_id: institutionId, is_demo: true }));
      const { data: studentRows, error: ste } = await db.from('students').insert(students).select('id');
      if (ste) throw ste;

      const assignments = (studentRows as { id: string }[]).map((s, i) => ({
        institution_id: institutionId, student_id: s.id, route_id: route.id,
        stop_id: (stopRows as { id: string }[])[i]?.id ?? null, direction: 'both', is_demo: true,
      }));
      const { error: ae } = await db.from('student_transport_assignments').insert(assignments);
      if (ae) throw ae;

      toast.success('Demo senaryosu oluşturuldu (1 araç, 1 hat, 3 durak, 2 öğrenci)');
      loadStats();
    } catch (err) {
      toast.error((err as { message?: string }).message || 'Demo verisi oluşturulamadı');
    } finally {
      setSeeding(false);
    }
  };

  const cards = [
    { title: 'Araç', value: stats.vehicles, icon: Bus, to: '/transport/vehicles' },
    { title: 'Hat', value: stats.routes, icon: RouteIcon, to: '/transport/routes' },
    { title: 'Servis Öğrencisi', value: stats.students, icon: Users, to: '/transport/students' },
    { title: 'Aktif Sefer', value: stats.activeTrips, icon: Radio, to: '/transport/live' },
  ];

  return (
    <AdminLayout>
      <PageHeader title="Servis Paneli" description="Öğrenci ulaşımına genel bakış"
        actions={
          <Button asChild variant="outline" className="min-h-11">
            <Link to="/transport/driver"><Smartphone className="mr-2 h-4 w-4" />Şoför Ekranı</Link>
          </Button>
        } />

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {cards.map(c => (
          <Link key={c.title} to={c.to}>
            <Card className="hover:border-primary transition">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{c.title}</p>
                  <p className="text-2xl font-bold">{c.value}</p>
                </div>
                <c.icon className="h-6 w-6 text-primary" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarOff className="h-4 w-4" />Servis Kullanmama Bildirimleri ({absences.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {absences.length === 0 ? (
            <p className="text-sm text-muted-foreground">Bugün ve sonrası için bildirim yok.</p>
          ) : (
            <div className="divide-y">
              {absences.map(a => (
                <div key={a.id} className="py-2 flex items-center justify-between gap-3 text-sm">
                  <span className="truncate font-medium">
                    {a.students ? `${a.students.first_name} ${a.students.last_name}` : 'Öğrenci'}
                  </span>
                  <span className="text-muted-foreground text-xs text-right shrink-0">
                    {new Date(`${a.absence_date}T00:00:00`).toLocaleDateString('tr-TR')} · {ABSENCE_DIRECTION_LABELS[a.direction]}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 mt-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Konum & Gizlilik Ayarları</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Konum saklama süresi (gün)</Label>
              <Input inputMode="numeric" value={retention} onChange={e => setRetention(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Konum gönderim aralığı (saniye)</Label>
              <Input inputMode="numeric" value={interval} onChange={e => setIntervalValue(e.target.value)} />
            </div>
            <Button onClick={saveSettings} className="min-h-11">Kaydet</Button>
            <p className="text-xs text-muted-foreground">
              Tüm sefer hareketleri (başlangıç, biniş, iniş, bitiş) denetim için kayıt altına alınır.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><FlaskConical className="h-4 w-4" />Test Senaryosu</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Sistemi denemek için demo olarak işaretlenmiş 1 araç, 1 hat, 3 durak ve 2 öğrenci oluşturur.
              Mevcut verileriniz etkilenmez.
            </p>
            <Button variant="outline" className="min-h-11" disabled={seeding} onClick={seedDemo}>
              Demo Verisi Oluştur
            </Button>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
