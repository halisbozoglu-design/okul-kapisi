import { useCallback, useEffect, useState } from 'react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { PageHeader } from '@/components/common/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/common/EmptyState';
import { toast } from 'sonner';
import { db } from '@/lib/db';
import { useSecurityDevice } from '@/hooks/useSecurityDevice';
import { useAuth } from '@/hooks/useAuth';
import { exitVisit } from '@/lib/security/visitors';
import { LogOut, Clock } from 'lucide-react';

interface VisitRow {
  id: string;
  entry_at: string;
  visit_reason: string | null;
  visitor_card_no: string | null;
  status: string;
  visitor_people: { full_name: string; phone: string | null } | null;
  students: { first_name: string; last_name: string; student_no: string | null } | null;
  entry: { name: string } | null;
}

const SELECT = `id, entry_at, visit_reason, visitor_card_no, status,
  visitor_people(full_name, phone),
  students:related_student_id(first_name, last_name, student_no),
  entry:entry_location_id(name)`;

export default function VisitorsInsidePage() {
  const { institutionId, locationId } = useSecurityDevice();
  const { profile } = useAuth();
  const [rows, setRows] = useState<VisitRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!institutionId) return;
    setLoading(true);
    const { data } = await db
      .from('visitor_visits')
      .select(SELECT)
      .eq('institution_id', institutionId)
      .in('status', ['inside', 'pending_approval'])
      .order('entry_at', { ascending: false });
    setRows((data as VisitRow[]) ?? []);
    setLoading(false);
  }, [institutionId]);

  useEffect(() => { load(); }, [load]);

  const handleExit = async (id: string) => {
    if (!profile?.id) return;
    try {
      await exitVisit(id, locationId, profile.id);
      toast.success('Çıkış kaydedildi');
      load();
    } catch (e) {
      toast.error((e as Error).message || 'Çıkış kaydedilemedi');
    }
  };

  return (
    <AdminLayout>
      <PageHeader title="İçeridekiler" description="Halen okul içinde bulunan ziyaretçiler" />
      {loading ? (
        <p className="text-muted-foreground">Yükleniyor...</p>
      ) : rows.length === 0 ? (
        <EmptyState title="İçeride ziyaretçi yok" description="Yeni giriş yapıldığında burada görünür." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((v) => (
            <Card key={v.id}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold">{v.visitor_people?.full_name ?? '—'}</p>
                  <Badge variant={v.status === 'inside' ? 'default' : 'secondary'}>
                    {v.status === 'inside' ? 'İçeride' : 'Onay Bekliyor'}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {new Date(v.entry_at).toLocaleString('tr-TR')} · {v.entry?.name ?? '—'}
                </p>
                {v.students && (
                  <p className="text-sm">Öğrenci: {v.students.first_name} {v.students.last_name} ({v.students.student_no ?? '—'})</p>
                )}
                {v.visit_reason && <p className="text-sm">Neden: {v.visit_reason}</p>}
                {v.visitor_card_no && <p className="text-sm">Kart No: {v.visitor_card_no}</p>}
                <Button className="w-full h-11" variant="outline" onClick={() => handleExit(v.id)}>
                  <LogOut className="h-4 w-4 mr-2" /> Çıkış Yap
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </AdminLayout>
  );
}
