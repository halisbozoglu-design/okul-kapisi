import { db } from '@/lib/db';
import { hashTc, tcLast4 } from './tc';

export interface VisitorPerson {
  id: string;
  institution_id: string;
  full_name: string;
  phone: string | null;
  tc_last4: string | null;
  tc_hash: string | null;
  source: string;
  guardian_id: string | null;
}

export interface StudentLite {
  id: string;
  first_name: string;
  last_name: string;
  student_no: string | null;
  section_id: string | null;
  section_name?: string | null;
}

export interface RestrictionLite {
  id: string;
  restriction_type: string;
  decision: 'allow' | 'deny' | 'approval_required';
  legal_basis_note: string | null;
  related_student_id: string | null;
}

const PERSON_COLS = 'id, institution_id, full_name, phone, tc_last4, tc_hash, source, guardian_id';
const STUDENT_COLS = 'id, first_name, last_name, student_no, section_id, sections(name)';

function mapStudent(row: Record<string, unknown>): StudentLite {
  const section = row.sections as { name?: string } | null;
  return {
    id: row.id as string,
    first_name: row.first_name as string,
    last_name: row.last_name as string,
    student_no: (row.student_no as string) ?? null,
    section_id: (row.section_id as string) ?? null,
    section_name: section?.name ?? null,
  };
}

/** Açık TC asla gönderilmez; yalnızca kurum bazlı hash ile eşleşme aranır. */
export async function findVisitorByTc(institutionId: string, tc: string): Promise<VisitorPerson | null> {
  const hash = await hashTc(tc, institutionId);
  const { data } = await db
    .from('visitor_people')
    .select(PERSON_COLS)
    .eq('institution_id', institutionId)
    .eq('tc_hash', hash)
    .maybeSingle();
  return (data as VisitorPerson) ?? null;
}

export async function searchVisitorPeople(institutionId: string, query: string): Promise<VisitorPerson[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const { data } = await db
    .from('visitor_people')
    .select(PERSON_COLS)
    .eq('institution_id', institutionId)
    .or(`full_name.ilike.%${q}%,phone.ilike.%${q}%`)
    .limit(20);
  return (data as VisitorPerson[]) ?? [];
}

export async function searchStudents(institutionId: string, query: string): Promise<StudentLite[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const { data } = await db
    .from('students')
    .select(STUDENT_COLS)
    .eq('institution_id', institutionId)
    .is('deleted_at', null)
    .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,student_no.ilike.%${q}%`)
    .limit(20);
  return ((data as Record<string, unknown>[]) ?? []).map(mapStudent);
}

/** Bir veli kaydına bağlı öğrenciler (kopya veri yerine ilişki kullanılır). */
export async function studentsOfGuardian(guardianId: string): Promise<StudentLite[]> {
  const { data: g } = await db
    .from('student_guardians')
    .select('user_id')
    .eq('id', guardianId)
    .maybeSingle();
  if (!g?.user_id) return [];
  const { data } = await db
    .from('student_guardians')
    .select(`student_id, students(${STUDENT_COLS})`)
    .eq('user_id', g.user_id)
    .eq('is_active', true)
    .is('deleted_at', null);
  return ((data as Record<string, unknown>[]) ?? [])
    .map((r) => r.students as Record<string, unknown> | null)
    .filter(Boolean)
    .map((s) => mapStudent(s as Record<string, unknown>));
}

export async function guardiansOfStudent(studentId: string) {
  const { data } = await db
    .from('student_guardians')
    .select('id, user_id, relation, can_track')
    .eq('student_id', studentId)
    .eq('is_active', true)
    .is('deleted_at', null);
  return (data as Array<{ id: string; user_id: string; relation: string | null }>) ?? [];
}

export async function upsertVisitorPerson(params: {
  institutionId: string;
  fullName: string;
  phone?: string | null;
  tc?: string | null;
  guardianId?: string | null;
  source?: 'manual' | 'guardian' | 'existing';
  existingId?: string | null;
}): Promise<VisitorPerson | null> {
  const { institutionId, fullName, phone, tc, guardianId, source = 'manual', existingId } = params;
  const payload: Record<string, unknown> = {
    institution_id: institutionId,
    full_name: fullName,
    phone: phone || null,
    guardian_id: guardianId || null,
    source,
  };
  if (tc) {
    payload.tc_hash = await hashTc(tc, institutionId);
    payload.tc_last4 = tcLast4(tc);
  }
  if (existingId) {
    const { data, error } = await db
      .from('visitor_people')
      .update(payload)
      .eq('id', existingId)
      .select(PERSON_COLS)
      .maybeSingle();
    if (error) throw error;
    return (data as VisitorPerson) ?? null;
  }
  const { data, error } = await db
    .from('visitor_people')
    .insert(payload)
    .select(PERSON_COLS)
    .maybeSingle();
  if (error) throw error;
  return (data as VisitorPerson) ?? null;
}

export async function activeRestrictions(
  institutionId: string,
  visitorPersonId: string | null,
  studentId: string | null,
): Promise<RestrictionLite[]> {
  if (!visitorPersonId && !studentId) return [];
  let q = db
    .from('visitor_access_restrictions')
    .select('id, restriction_type, decision, legal_basis_note, related_student_id, visitor_person_id, starts_at, ends_at')
    .eq('institution_id', institutionId)
    .eq('is_active', true);
  const ors: string[] = [];
  if (visitorPersonId) ors.push(`visitor_person_id.eq.${visitorPersonId}`);
  if (studentId) ors.push(`related_student_id.eq.${studentId}`);
  q = q.or(ors.join(','));
  const { data } = await q;
  const now = Date.now();
  return ((data as Array<RestrictionLite & { starts_at: string; ends_at: string | null }>) ?? []).filter(
    (r) => new Date(r.starts_at).getTime() <= now && (!r.ends_at || new Date(r.ends_at).getTime() >= now),
  );
}

export function worstDecision(rs: RestrictionLite[]): 'allow' | 'deny' | 'approval_required' {
  if (rs.some((r) => r.decision === 'deny')) return 'deny';
  if (rs.some((r) => r.decision === 'approval_required')) return 'approval_required';
  return 'allow';
}

export interface CreateVisitInput {
  institutionId: string;
  visitorPersonId: string;
  entryLocationId: string | null;
  relatedStudentId?: string | null;
  personToMeetProfileId?: string | null;
  personToMeetText?: string | null;
  visitReason?: string | null;
  visitorCardNo?: string | null;
  phoneUsed?: string | null;
  physicalIdSeen: boolean;
  identityMethod: 'camera_live' | 'nfc' | 'manual';
  operatorProfileId: string;
  requiresApproval?: boolean;
}

export async function createVisit(input: CreateVisitInput) {
  if (!input.physicalIdSeen) {
    throw new Error('Fiziksel kimlik kontrolü yapılmadan giriş tamamlanamaz.');
  }
  const now = new Date().toISOString();
  const payload = {
    institution_id: input.institutionId,
    visitor_person_id: input.visitorPersonId,
    entry_location_id: input.entryLocationId,
    related_student_id: input.relatedStudentId || null,
    person_to_meet_profile_id: input.personToMeetProfileId || null,
    person_to_meet_text: input.personToMeetText || null,
    visit_reason: input.visitReason || null,
    visitor_card_no: input.visitorCardNo || null,
    phone_used: input.phoneUsed || null,
    status: input.requiresApproval ? 'pending_approval' : 'inside',
    entry_at: now,
    entered_by_profile_id: input.operatorProfileId,
    physical_id_seen: true,
    identity_method: input.identityMethod,
    identity_verified_at: now,
    identity_verified_by_profile_id: input.operatorProfileId,
  };
  const { data, error } = await db.from('visitor_visits').insert(payload).select('id, status').maybeSingle();
  if (error) throw error;
  return data as { id: string; status: string };
}

export async function exitVisit(visitId: string, exitLocationId: string | null, operatorProfileId: string) {
  const { error } = await db
    .from('visitor_visits')
    .update({
      status: 'exited',
      exit_at: new Date().toISOString(),
      exit_location_id: exitLocationId,
      exited_by_profile_id: operatorProfileId,
    })
    .eq('id', visitId);
  if (error) throw error;
}

export async function cancelVisit(visitId: string, reason: string) {
  const { error } = await db
    .from('visitor_visits')
    .update({ status: 'cancelled', cancellation_reason: reason })
    .eq('id', visitId);
  if (error) throw error;
}
