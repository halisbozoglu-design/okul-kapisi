import { useCallback, useEffect, useMemo, useState } from 'react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DataTable, Column } from '@/components/common/DataTable';
import { db } from '@/lib/db';
import { useSecurityDevice } from '@/hooks/useSecurityDevice';
import { downloadCsv, ExportColumn, printTable } from '@/lib/security/export';
import { FileSpreadsheet, Printer, FileText } from 'lucide-react';

interface LedgerRow {
  id: string;
  entry_at: string;
  exit_at: string | null;
  visit_reason: string | null;
  visitor_card_no: string | null;
  status: string;
  person_to_meet_text: string | null;
  visitor_people: { full_name: string; phone: string | null; tc_last4: string | null } | null;
  students: { first_name: string; last_name: string; student_no: string | null; sections: { name: string } | null } | null;
  entry: { name: string } | null;
  exit: { name: string } | null;
  operator: { first_name: string | null; last_name: string | null } | null;
}

const SELECT = `id, entry_at, exit_at, visit_reason, visitor_card_no, status, person_to_meet_text,
  visitor_people(full_name, phone, tc_last4),
  students:related_student_id(first_name, last_name, student_no, sections(name)),
  entry:entry_location_id(name),
  exit:exit_location_id(name),
  operator:entered_by_profile_id(first_name, last_name)`;

const STATUS_LABELS: Record<string, string> = {
  inside: 'İçeride', exited: 'Çıktı', pending_approval: 'Onay Bekliyor', cancelled: 'İptal', rejected: 'Reddedildi',
};

function startOf(range: string): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (range === 'week') d.setDate(d.getDate() - d.getDay() + 1);
  if (range === 'month') d.setDate(1);
  return d.toISOString();
}

export default function VisitorLedgerPage() {
  const { institutionId, entryLocations } = useSecurityDevice();
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState('today');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [gate, setGate] = useState<string>('all');
  const [onlyInside, setOnlyInside] = useState(false);
  const [search, setSearch] = useState('');
  const [visibleCols, setVisibleCols] = useState<string[]>([
    'sn', 'name', 'phone', 'meet', 'student', 'class', 'reason', 'gate', 'card', 'date', 'in', 'out', 'exitGate', 'operator', 'status',
  ]);

  const load = useCallback(async () => {
    if (!institutionId) return;
    setLoading(true);
    let q = db.from('visitor_visits').select(SELECT).eq('institution_id', institutionId);
    if (range === 'custom') {
      if (from) q = q.gte('entry_at', new Date(`${from}T00:00:00`).toISOString());
      if (to) q = q.lte('entry_at', new Date(`${to}T23:59:59`).toISOString());
    } else {
      q = q.gte('entry_at', startOf(range));
    }
    if (gate !== 'all') q = q.eq('entry_location_id', gate);
    if (onlyInside) q = q.eq('status', 'inside');
    const { data } = await q.order('entry_at', { ascending: false }).limit(1000);
    setRows((data as LedgerRow[]) ?? []);
    setLoading(false);
  }, [institutionId, range, from, to, gate, onlyInside]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR');
    if (!q) return rows;
    return rows.filter((r) => {
      const hay = [
        r.visitor_people?.full_name, r.visitor_people?.phone, r.person_to_meet_text,
        r.students ? `${r.students.first_name} ${r.students.last_name}` : '',
      ].join(' ').toLocaleLowerCase('tr-TR');
      return hay.includes(q);
    });
  }, [rows, search]);

  const allColumns: Array<Column<LedgerRow> & ExportColumn<LedgerRow>> = useMemo(() => [
    { key: 'sn', title: 'S.N.', value: (r) => filtered.indexOf(r) + 1, render: (r) => filtered.indexOf(r) + 1 },
    { key: 'name', title: 'Ziyaretçi', value: (r) => r.visitor_people?.full_name ?? '', render: (r) => r.visitor_people?.full_name ?? '—' },
    { key: 'phone', title: 'Telefon', value: (r) => r.visitor_people?.phone ?? '', render: (r) => r.visitor_people?.phone ?? '—' },
    { key: 'meet', title: 'Görüşülecek Kişi/Birim', value: (r) => r.person_to_meet_text ?? '', render: (r) => r.person_to_meet_text ?? '—' },
    {
      key: 'student', title: 'Öğrenci', value: (r) => (r.students ? `${r.students.first_name} ${r.students.last_name}` : ''),
      render: (r) => (r.students ? `${r.students.first_name} ${r.students.last_name}` : '—'),
    },
    {
      key: 'class', title: 'Sınıf / No',
      value: (r) => (r.students ? `${r.students.sections?.name ?? '—'} / ${r.students.student_no ?? '—'}` : ''),
      render: (r) => (r.students ? `${r.students.sections?.name ?? '—'} / ${r.students.student_no ?? '—'}` : '—'),
    },
    { key: 'reason', title: 'Ziyaret Nedeni', value: (r) => r.visit_reason ?? '', render: (r) => r.visit_reason ?? '—' },
    { key: 'gate', title: 'Giriş Kapısı', value: (r) => r.entry?.name ?? '', render: (r) => r.entry?.name ?? '—' },
    { key: 'card', title: 'Kart No', value: (r) => r.visitor_card_no ?? '', render: (r) => r.visitor_card_no ?? '—' },
    { key: 'date', title: 'Tarih', value: (r) => new Date(r.entry_at).toLocaleDateString('tr-TR'), render: (r) => new Date(r.entry_at).toLocaleDateString('tr-TR') },
    { key: 'in', title: 'Giriş Saati', value: (r) => new Date(r.entry_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }), render: (r) => new Date(r.entry_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) },
    {
      key: 'out', title: 'Çıkış Saati',
      value: (r) => (r.exit_at ? new Date(r.exit_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : ''),
      render: (r) => (r.exit_at ? new Date(r.exit_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '—'),
    },
    { key: 'exitGate', title: 'Çıkış Kapısı', value: (r) => r.exit?.name ?? '', render: (r) => r.exit?.name ?? '—' },
    {
      key: 'operator', title: 'Görevli',
      value: (r) => `${r.operator?.first_name ?? ''} ${r.operator?.last_name ?? ''}`.trim(),
      render: (r) => `${r.operator?.first_name ?? ''} ${r.operator?.last_name ?? ''}`.trim() || '—',
    },
    {
      key: 'status', title: 'Durum', value: (r) => STATUS_LABELS[r.status] ?? r.status,
      render: (r) => <Badge variant={r.status === 'inside' ? 'default' : 'secondary'}>{STATUS_LABELS[r.status] ?? r.status}</Badge>,
    },
  ], [filtered]);

  const active = allColumns.filter((c) => visibleCols.includes(c.key));

  const toggleCol = (key: string) =>
    setVisibleCols((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  return (
    <AdminLayout>
      <PageHeader
        title="Ziyaretçi Defteri"
        description="Dijital ana kayıt — T.C. kimlik numarası raporlarda gösterilmez"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="h-11" onClick={() => downloadCsv('ziyaretci-defteri', active, filtered)}>
              <FileSpreadsheet className="h-4 w-4 mr-2" />Excel/CSV
            </Button>
            <Button variant="outline" className="h-11" onClick={() => printTable('Ziyaretçi Defteri', active, filtered)}>
              <Printer className="h-4 w-4 mr-2" />Yazdır
            </Button>
            <Button variant="outline" className="h-11" onClick={() => printTable('Ziyaretçi Defteri', active, filtered)}>
              <FileText className="h-4 w-4 mr-2" />PDF
            </Button>
          </div>
        }
      />

      <Card className="mb-4">
        <CardContent className="p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <Label>Dönem</Label>
            <Select value={range} onValueChange={setRange}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Bugün</SelectItem>
                <SelectItem value="week">Bu Hafta</SelectItem>
                <SelectItem value="month">Bu Ay</SelectItem>
                <SelectItem value="custom">Özel Aralık</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {range === 'custom' && (
            <>
              <div className="space-y-2"><Label>Başlangıç</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
              <div className="space-y-2"><Label>Bitiş</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
            </>
          )}
          <div className="space-y-2">
            <Label>Giriş Kapısı</Label>
            <Select value={gate} onValueChange={setGate}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tümü</SelectItem>
                {entryLocations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 h-11 cursor-pointer">
              <Checkbox checked={onlyInside} onCheckedChange={(v) => setOnlyInside(v === true)} />
              <span className="text-sm">Sadece içeridekiler</span>
            </label>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardContent className="p-4">
          <Label className="mb-2 block">Sütunlar</Label>
          <div className="flex flex-wrap gap-3">
            {allColumns.map((c) => (
              <label key={c.key} className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={visibleCols.includes(c.key)} onCheckedChange={() => toggleCol(c.key)} />
                {c.title}
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <p className="text-muted-foreground">Yükleniyor...</p>
      ) : (
        <div className="overflow-x-auto">
          <DataTable
            columns={active}
            data={filtered}
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Kişi, telefon, öğrenci ara..."
            emptyTitle="Kayıt bulunamadı"
          />
        </div>
      )}
    </AdminLayout>
  );
}
