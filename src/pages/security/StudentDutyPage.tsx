import { useCallback, useEffect, useMemo, useState } from 'react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState } from '@/components/common/EmptyState';
import { toast } from 'sonner';
import { db } from '@/lib/db';
import { useAuth } from '@/hooks/useAuth';
import { useSecurityDevice } from '@/hooks/useSecurityDevice';
import { dateRange, DutyStudent, generateDutyPlan, CalendarDay } from '@/lib/security/duty';
import { downloadCsv, ExportColumn, printTable } from '@/lib/security/export';
import { CalendarClock, FileSpreadsheet, Printer, Check, X } from 'lucide-react';

interface AssignmentRow {
  id: string;
  duty_date: string;
  status: string;
  location_id: string;
  student_id: string;
  security_locations: { name: string } | null;
  students: { first_name: string; last_name: string; student_no: string | null; sections: { name: string } | null } | null;
}

const ASSIGN_SELECT = `id, duty_date, status, location_id, student_id,
  security_locations:location_id(name),
  students:student_id(first_name, last_name, student_no, sections(name))`;

const today = () => new Date().toISOString().slice(0, 10);

export default function StudentDutyPage() {
  const { institutionId, dutyLocations, loading: devLoading } = useSecurityDevice();
  const { profile } = useAuth();

  const [start, setStart] = useState(today());
  const [end, setEnd] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 6);
    return d.toISOString().slice(0, 10);
  });
  const [perLocation, setPerLocation] = useState('1');
  const [rows, setRows] = useState<AssignmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [checkDate, setCheckDate] = useState(today());
  const [genderSupported, setGenderSupported] = useState(true);

  const load = useCallback(async () => {
    if (!institutionId) return;
    setLoading(true);
    const { data } = await db
      .from('student_duty_assignments')
      .select(ASSIGN_SELECT)
      .eq('institution_id', institutionId)
      .gte('duty_date', start)
      .lte('duty_date', end)
      .order('duty_date');
    setRows((data as AssignmentRow[]) ?? []);
    setLoading(false);
  }, [institutionId, start, end]);

  useEffect(() => { load(); }, [load]);

  const generate = async () => {
    if (!institutionId) return;
    if (dutyLocations.length === 0) {
      toast.error('Nöbet yeri tanımlı değil. Önce “Giriş / Nöbet Yerleri” ekranından nöbet yeri işaretleyin.');
      return;
    }
    setGenerating(true);
    try {
      const [{ data: studentRows }, { data: exemptRows }, { data: calRows }, { data: yearRows }] = await Promise.all([
        db.from('students').select('id, first_name, last_name, student_no, section_id')
          .eq('institution_id', institutionId).eq('is_active', true).is('deleted_at', null).limit(2000),
        db.from('student_duty_exemptions').select('student_id, start_date, end_date')
          .eq('institution_id', institutionId).eq('is_active', true),
        db.from('school_calendar_days').select('date, is_school_day')
          .eq('institution_id', institutionId).gte('date', start).lte('date', end),
        db.from('academic_years').select('id, start_date, end_date')
          .eq('institution_id', institutionId).eq('is_active', true).is('deleted_at', null).limit(1),
      ]);

      const students = ((studentRows as Record<string, unknown>[]) ?? []).map<DutyStudent>((s) => ({
        id: s.id as string,
        first_name: s.first_name as string,
        last_name: s.last_name as string,
        student_no: (s.student_no as string) ?? null,
        section_id: (s.section_id as string) ?? null,
        gender: undefined, // students tablosunda cinsiyet alanı yok
      }));
      setGenderSupported(false);

      if (students.length === 0) {
        toast.error('Uygun öğrenci bulunamadı.');
        return;
      }

      const academicYearId = (yearRows as Array<{ id: string }> | null)?.[0]?.id ?? null;
      const dates = dateRange(start, end);
      const calendar = ((calRows as CalendarDay[]) ?? []);

      // Adalet devamlılığı için geçmiş atamalar
      const { data: history } = await db
        .from('student_duty_assignments')
        .select('duty_date, location_id, student_id')
        .eq('institution_id', institutionId)
        .lt('duty_date', start);
      const priorCounts: Record<string, number> = {};
      const priorLastDuty: Record<string, string> = {};
      ((history as Array<{ duty_date: string; student_id: string }>) ?? []).forEach((h) => {
        priorCounts[h.student_id] = (priorCounts[h.student_id] ?? 0) + 1;
        if (!priorLastDuty[h.student_id] || priorLastDuty[h.student_id] < h.duty_date) {
          priorLastDuty[h.student_id] = h.duty_date;
        }
      });

      const existing = rows.map((r) => ({ duty_date: r.duty_date, location_id: r.location_id, student_id: r.student_id }));
      const cap = Math.max(1, Number(perLocation) || 1);

      const result = generateDutyPlan({
        students,
        locations: dutyLocations.map((l) => ({
          id: l.id, name: l.name, capacity: l.capacity ?? cap, gender_rule: l.gender_rule,
        })),
        dates,
        existing,
        exemptStudentIds: ((exemptRows as Array<{ student_id: string; start_date: string; end_date: string | null }>) ?? [])
          .filter((e) => e.start_date <= end && (!e.end_date || e.end_date >= start))
          .map((e) => e.student_id),
        calendar,
        priorCounts,
        priorLastDuty,
      });

      if (result.created.length === 0) {
        toast.info('Doldurulacak boş nöbet yok.');
        return;
      }

      const { error } = await db.from('student_duty_assignments').insert(
        result.created.map((c) => ({ ...c, institution_id: institutionId, academic_year_id: academicYearId })),
      );
      if (error) throw error;

      if (academicYearId && result.lastGeneratedDate) {
        await db.from('student_duty_generation_state').upsert(
          {
            institution_id: institutionId,
            academic_year_id: academicYearId,
            last_generated_date: result.lastGeneratedDate,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'institution_id,academic_year_id' },
        );
      }

      toast.success(`${result.created.length} nöbet ataması oluşturuldu`);
      load();
    } catch (e) {
      toast.error((e as Error).message || 'Nöbet planı oluşturulamadı');
    } finally {
      setGenerating(false);
    }
  };

  const setStatus = async (id: string, status: 'present' | 'absent') => {
    const { error } = await db
      .from('student_duty_assignments')
      .update({ status, checked_at: new Date().toISOString(), checked_by_profile_id: profile?.id ?? null })
      .eq('id', id);
    if (error) {
      toast.error('Kontrol kaydedilemedi');
      return;
    }
    toast.success(status === 'present' ? 'Yerinde olarak işaretlendi' : 'Yerinde değil olarak işaretlendi');
    load();
  };

  const dayRows = useMemo(() => rows.filter((r) => r.duty_date === checkDate), [rows, checkDate]);

  const exportCols: ExportColumn<AssignmentRow>[] = [
    { key: 'date', title: 'Tarih', value: (r) => r.duty_date },
    { key: 'loc', title: 'Nöbet Yeri', value: (r) => r.security_locations?.name ?? '' },
    { key: 'student', title: 'Öğrenci', value: (r) => `${r.students?.first_name ?? ''} ${r.students?.last_name ?? ''}` },
    { key: 'class', title: 'Sınıf', value: (r) => r.students?.sections?.name ?? '' },
    { key: 'no', title: 'Okul No', value: (r) => r.students?.student_no ?? '' },
    { key: 'status', title: 'Durum', value: (r) => r.status },
  ];

  return (
    <AdminLayout>
      <PageHeader
        title="Nöbetçi Öğrenci"
        description="Adil dağıtım: en az nöbet sayısı, ardından en eski nöbet tarihi önceliklidir."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" className="h-11" onClick={() => downloadCsv('nobet-plani', exportCols, rows)}>
              <FileSpreadsheet className="h-4 w-4 mr-2" />Excel/CSV
            </Button>
            <Button variant="outline" className="h-11" onClick={() => printTable('Nöbet Planı', exportCols, rows)}>
              <Printer className="h-4 w-4 mr-2" />Yazdır / PDF
            </Button>
          </div>
        }
      />

      {!genderSupported && (
        <Alert className="mb-4">
          <AlertDescription>
            Öğrenci kayıtlarında cinsiyet alanı bulunmadığı için “kız/erkek” nöbet yeri kuralı uygulanamıyor; tüm öğrenciler aday kabul edilir.
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="plan">
        <TabsList className="mb-4">
          <TabsTrigger value="plan">Plan</TabsTrigger>
          <TabsTrigger value="check">Günlük Kontrol</TabsTrigger>
        </TabsList>

        <TabsContent value="plan" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Plan Üret</CardTitle></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-4">
              <div className="space-y-2"><Label>Başlangıç</Label><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div>
              <div className="space-y-2"><Label>Bitiş</Label><Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
              <div className="space-y-2">
                <Label>Yer Başına Öğrenci</Label>
                <Input type="number" min={1} value={perLocation} onChange={(e) => setPerLocation(e.target.value)} />
              </div>
              <div className="flex items-end">
                <Button className="w-full h-11" onClick={generate} disabled={generating || devLoading}>
                  <CalendarClock className="h-4 w-4 mr-2" />{generating ? 'Üretiliyor...' : 'Eksikleri Doldur'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {loading ? (
            <p className="text-muted-foreground">Yükleniyor...</p>
          ) : rows.length === 0 ? (
            <EmptyState title="Bu aralıkta nöbet planı yok" description="Tarih aralığı seçip plan üretin." />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {rows.map((r) => (
                <Card key={r.id}>
                  <CardContent className="p-4 space-y-1">
                    <div className="flex justify-between items-start gap-2">
                      <p className="font-medium">{r.students?.first_name} {r.students?.last_name}</p>
                      <Badge variant="secondary">{r.status}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {new Date(`${r.duty_date}T00:00:00`).toLocaleDateString('tr-TR')} · {r.security_locations?.name ?? '—'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {r.students?.sections?.name ?? '—'} · No: {r.students?.student_no ?? '—'}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="check" className="space-y-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-2">
              <Label>Kontrol Tarihi</Label>
              <Input type="date" value={checkDate} onChange={(e) => setCheckDate(e.target.value)} />
            </div>
            <div className="space-y-2 min-w-[180px]">
              <Label>Nöbet Yeri</Label>
              <Select value="all" disabled>
                <SelectTrigger><SelectValue placeholder="Tümü" /></SelectTrigger>
                <SelectContent><SelectItem value="all">Tümü</SelectItem></SelectContent>
              </Select>
            </div>
          </div>

          {dayRows.length === 0 ? (
            <EmptyState title="Bu tarihte nöbet yok" />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {dayRows.map((r) => (
                <Card key={r.id}>
                  <CardContent className="p-4 space-y-3">
                    <div>
                      <p className="font-medium">{r.students?.first_name} {r.students?.last_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {r.security_locations?.name ?? '—'} · {r.students?.sections?.name ?? '—'}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button className="flex-1 h-11" variant={r.status === 'present' ? 'default' : 'outline'} onClick={() => setStatus(r.id, 'present')}>
                        <Check className="h-4 w-4 mr-2" />Yerinde
                      </Button>
                      <Button className="flex-1 h-11" variant={r.status === 'absent' ? 'destructive' : 'outline'} onClick={() => setStatus(r.id, 'absent')}>
                        <X className="h-4 w-4 mr-2" />Yerinde Değil
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </AdminLayout>
  );
}
