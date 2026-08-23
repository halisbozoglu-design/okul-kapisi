import { useEffect, useMemo, useState } from 'react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Camera, Nfc, Search, Phone, UserPlus, ArrowLeft, ShieldAlert, ShieldCheck } from 'lucide-react';
import { LiveIdCardScanner } from '@/components/security/LiveIdCardScanner';
import { useSecurityDevice } from '@/hooks/useSecurityDevice';
import { useAuth } from '@/hooks/useAuth';
import { maskTc } from '@/lib/security/tc';
import { getNfcCapability, getNfcProvider, nfcCapabilityMessage } from '@/lib/identity/nfc';
import {
  activeRestrictions, createVisit, findVisitorByTc, RestrictionLite, searchStudents,
  searchVisitorPeople, StudentLite, studentsOfGuardian, upsertVisitorPerson, VisitorPerson, worstDecision,
} from '@/lib/security/visitors';

type Step = 'home' | 'search' | 'form';

export default function SecurityCheckInPage() {
  const { institutionId, entryLocations, locationId, setLocationId, loading } = useSecurityDevice();
  const { profile } = useAuth();

  const [step, setStep] = useState<Step>('home');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [nfcMsg, setNfcMsg] = useState<string | null>(null);

  const [searchMode, setSearchMode] = useState<'person' | 'phone' | 'student'>('person');
  const [query, setQuery] = useState('');
  const [people, setPeople] = useState<VisitorPerson[]>([]);
  const [students, setStudents] = useState<StudentLite[]>([]);

  const [tc, setTc] = useState<string | null>(null);
  const [personId, setPersonId] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [guardianId, setGuardianId] = useState<string | null>(null);
  const [linkedStudents, setLinkedStudents] = useState<StudentLite[]>([]);
  const [relatedStudent, setRelatedStudent] = useState<StudentLite | null>(null);
  const [personToMeet, setPersonToMeet] = useState('');
  const [reason, setReason] = useState('');
  const [cardNo, setCardNo] = useState('');
  const [physicalIdSeen, setPhysicalIdSeen] = useState(false);
  const [identityMethod, setIdentityMethod] = useState<'camera_live' | 'nfc' | 'manual'>('manual');
  const [restrictions, setRestrictions] = useState<RestrictionLite[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!locationId && entryLocations.length === 1) setLocationId(entryLocations[0].id);
  }, [entryLocations, locationId, setLocationId]);

  const decision = useMemo(() => worstDecision(restrictions), [restrictions]);

  const resetAll = () => {
    setStep('home'); setTc(null); setPersonId(null); setFullName(''); setPhone('');
    setGuardianId(null); setLinkedStudents([]); setRelatedStudent(null); setPersonToMeet('');
    setReason(''); setCardNo(''); setPhysicalIdSeen(false); setIdentityMethod('manual');
    setRestrictions([]); setQuery(''); setPeople([]); setStudents([]);
  };

  const loadRestrictions = async (pId: string | null, sId: string | null) => {
    if (!institutionId) return;
    try {
      setRestrictions(await activeRestrictions(institutionId, pId, sId));
    } catch {
      setRestrictions([]);
    }
  };

  const onScanConfirmed = async (r: { tc: string; fullName: string }) => {
    setScannerOpen(false);
    setTc(r.tc);
    setIdentityMethod('camera_live');
    setPhysicalIdSeen(true);
    setFullName(r.fullName);
    if (institutionId) {
      const found = await findVisitorByTc(institutionId, r.tc);
      if (found) await applyPerson(found);
    }
    setStep('form');
  };

  const applyPerson = async (p: VisitorPerson) => {
    setPersonId(p.id);
    setFullName(p.full_name);
    setPhone(p.phone ?? '');
    setGuardianId(p.guardian_id);
    if (p.guardian_id) {
      const st = await studentsOfGuardian(p.guardian_id);
      setLinkedStudents(st);
    }
    await loadRestrictions(p.id, null);
  };

  const runSearch = async () => {
    if (!institutionId) return;
    if (searchMode === 'student') {
      setStudents(await searchStudents(institutionId, query));
      setPeople([]);
    } else {
      setPeople(await searchVisitorPeople(institutionId, query));
      setStudents([]);
    }
  };

  const tryNfc = async () => {
    const cap = getNfcCapability();
    if (cap !== 'web_ndef_only') {
      setNfcMsg(nfcCapabilityMessage());
      return;
    }
    setNfcMsg('NFC etiketi bekleniyor...');
    const res = await getNfcProvider().scanTag();
    setNfcMsg(res.message);
  };

  const complete = async () => {
    if (!institutionId || !profile?.id) {
      toast.error('Kurum veya kullanıcı bilgisi bulunamadı.');
      return;
    }
    if (!physicalIdSeen) {
      toast.error('Fiziksel kimlik kontrolü zorunludur.');
      return;
    }
    if (decision === 'deny') {
      toast.error('Bu kişi için giriş kısıtı var. Yöneticiye yönlendirin.');
      return;
    }
    setSaving(true);
    try {
      const person = await upsertVisitorPerson({
        institutionId,
        fullName: fullName.trim(),
        phone: phone.trim() || null,
        tc,
        guardianId,
        source: guardianId ? 'guardian' : personId ? 'existing' : 'manual',
        existingId: personId,
      });
      if (!person) throw new Error('Ziyaretçi kaydı oluşturulamadı');
      await createVisit({
        institutionId,
        visitorPersonId: person.id,
        entryLocationId: locationId,
        relatedStudentId: relatedStudent?.id ?? null,
        personToMeetText: personToMeet.trim() || null,
        visitReason: reason.trim() || null,
        visitorCardNo: cardNo.trim() || null,
        phoneUsed: phone.trim() || null,
        physicalIdSeen: true,
        identityMethod,
        operatorProfileId: profile.id,
        requiresApproval: decision === 'approval_required',
      });
      toast.success(decision === 'approval_required' ? 'Kayıt yönetici onayına alındı' : 'Giriş tamamlandı');
      resetAll();
    } catch (e) {
      toast.error((e as Error).message || 'Giriş tamamlanamadı');
    } finally {
      setSaving(false);
    }
  };

  const locationPicker = (
    <div className="space-y-2">
      <Label>Giriş Noktası</Label>
      <Select value={locationId ?? ''} onValueChange={setLocationId}>
        <SelectTrigger className="h-12"><SelectValue placeholder="Bu cihazın kapısını seçin" /></SelectTrigger>
        <SelectContent>
          {entryLocations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <AdminLayout>
      <div className="mx-auto w-full max-w-lg space-y-4">
        <div className="flex items-center gap-2">
          {step !== 'home' && (
            <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => setStep('home')} aria-label="Geri">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          )}
          <h1 className="text-xl font-bold">Hızlı Ziyaretçi Girişi</h1>
        </div>

        <Alert>
          <ShieldCheck className="h-4 w-4" />
          <AlertTitle>Değişmez kural</AlertTitle>
          <AlertDescription>
            Fiziksel kimlik görülmeden giriş tamamlanamaz. Telefon, kayıt veya NFC yalnızca kişiyi bulur.
          </AlertDescription>
        </Alert>

        {!loading && entryLocations.length === 0 && (
          <Alert variant="destructive">
            <AlertDescription>Tanımlı ziyaretçi giriş noktası yok. Önce “Giriş / Nöbet Yerleri” ekranından ekleyin.</AlertDescription>
          </Alert>
        )}

        {step === 'home' && (
          <div className="space-y-3">
            {locationPicker}
            <Button className="w-full h-16 text-base" onClick={() => setScannerOpen(true)}>
              <Camera className="h-5 w-5 mr-2" /> KİMLİĞİ KAMERA İLE OKU
            </Button>
            <Button variant="outline" className="w-full h-14" onClick={tryNfc}>
              <Nfc className="h-5 w-5 mr-2" /> NFC İLE DENE
            </Button>
            {nfcMsg && <p className="text-sm text-muted-foreground px-1">{nfcMsg}</p>}
            <div className="grid grid-cols-1 gap-3">
              <Button variant="secondary" className="h-14" onClick={() => { setSearchMode('student'); setStep('search'); }}>
                <Search className="h-5 w-5 mr-2" /> Öğrenci / Veli Bul
              </Button>
              <Button variant="secondary" className="h-14" onClick={() => { setSearchMode('phone'); setStep('search'); }}>
                <Phone className="h-5 w-5 mr-2" /> Telefonla Bul
              </Button>
              <Button variant="secondary" className="h-14" onClick={() => { resetAll(); setStep('form'); }}>
                <UserPlus className="h-5 w-5 mr-2" /> Yeni Ziyaretçi
              </Button>
            </div>
          </div>
        )}

        {step === 'search' && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                className="h-12"
                placeholder={searchMode === 'student' ? 'Öğrenci adı veya no' : 'Ad veya telefon'}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && runSearch()}
              />
              <Button className="h-12" onClick={runSearch}>Ara</Button>
            </div>
            {people.map((p) => (
              <Card key={p.id} className="cursor-pointer" onClick={async () => { await applyPerson(p); setStep('form'); }}>
                <CardContent className="p-4">
                  <p className="font-medium">{p.full_name}</p>
                  <p className="text-sm text-muted-foreground">{p.phone ?? 'Telefon yok'}</p>
                </CardContent>
              </Card>
            ))}
            {students.map((s) => (
              <Card
                key={s.id}
                className="cursor-pointer"
                onClick={async () => { setRelatedStudent(s); await loadRestrictions(null, s.id); setStep('form'); }}
              >
                <CardContent className="p-4">
                  <p className="font-medium">{s.first_name} {s.last_name}</p>
                  <p className="text-sm text-muted-foreground">
                    {s.section_name ?? 'Sınıf yok'} · No: {s.student_no ?? '—'}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {step === 'form' && (
          <div className="space-y-4">
            {decision === 'deny' && (
              <Alert variant="destructive">
                <ShieldAlert className="h-4 w-4" />
                <AlertTitle>GİRİŞ YAPMAYIN — YÖNETİCİYE YÖNLENDİRİN</AlertTitle>
                <AlertDescription>Bu kişi/öğrenci için aktif bir giriş kısıtı bulunuyor.</AlertDescription>
              </Alert>
            )}
            {decision === 'approval_required' && (
              <Alert className="border-yellow-500/60">
                <ShieldAlert className="h-4 w-4" />
                <AlertTitle>Yönetici onayı gerekiyor</AlertTitle>
                <AlertDescription>Kayıt “onay bekliyor” olarak açılacak; kişi içeri alınmaz.</AlertDescription>
              </Alert>
            )}

            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="fn">Ad Soyad *</Label>
                  <Input id="fn" className="h-12" value={fullName} onChange={(e) => setFullName(e.target.value)} />
                </div>
                {tc && (
                  <div>
                    <p className="text-sm text-muted-foreground">T.C. Kimlik No</p>
                    <p className="font-mono">{maskTc(tc)}</p>
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="ph">Telefon</Label>
                  <Input id="ph" className="h-12" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
              </CardContent>
            </Card>

            {linkedStudents.length > 0 && (
              <div className="space-y-2">
                <Label>İlişkili Öğrenciler</Label>
                <div className="grid gap-2">
                  {linkedStudents.map((s) => (
                    <Card
                      key={s.id}
                      className={`cursor-pointer ${relatedStudent?.id === s.id ? 'border-primary' : ''}`}
                      onClick={async () => { setRelatedStudent(s); await loadRestrictions(personId, s.id); }}
                    >
                      <CardContent className="p-3 flex items-center justify-between">
                        <div>
                          <p className="font-medium">{s.first_name} {s.last_name}</p>
                          <p className="text-sm text-muted-foreground">{s.section_name ?? '—'} · No: {s.student_no ?? '—'}</p>
                        </div>
                        {relatedStudent?.id === s.id && <Badge>Seçili</Badge>}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {relatedStudent && linkedStudents.length === 0 && (
              <Card><CardContent className="p-3">
                <p className="text-sm text-muted-foreground">İlgili öğrenci</p>
                <p className="font-medium">{relatedStudent.first_name} {relatedStudent.last_name}</p>
                <p className="text-sm text-muted-foreground">{relatedStudent.section_name ?? '—'} · No: {relatedStudent.student_no ?? '—'}</p>
              </CardContent></Card>
            )}

            <div className="space-y-2">
              <Label htmlFor="ptm">Görüşülecek Kişi / Birim</Label>
              <Input id="ptm" className="h-12" value={personToMeet} onChange={(e) => setPersonToMeet(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rs">Ziyaret Nedeni</Label>
              <Textarea id="rs" value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cn">Ziyaretçi Kart No</Label>
              <Input id="cn" className="h-12" value={cardNo} onChange={(e) => setCardNo(e.target.value)} />
            </div>
            {locationPicker}

            <label className="flex items-start gap-3 rounded-lg border p-3 min-h-[44px] cursor-pointer">
              <Checkbox checked={physicalIdSeen} onCheckedChange={(v) => setPhysicalIdSeen(v === true)} className="mt-0.5" />
              <span className="text-sm">Kimliği fiziksel olarak gördüm ve kişiyle eşleştirdim</span>
            </label>

            <Button
              className="w-full h-16 text-base"
              disabled={!physicalIdSeen || !fullName.trim() || !locationId || saving || decision === 'deny'}
              onClick={complete}
            >
              GİRİŞİ TAMAMLA
            </Button>
          </div>
        )}
      </div>

      <LiveIdCardScanner open={scannerOpen} onClose={() => setScannerOpen(false)} onConfirmed={onScanConfirmed} />
    </AdminLayout>
  );
}
