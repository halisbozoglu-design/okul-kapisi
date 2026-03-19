export type AppRole =
  | 'super_admin'
  | 'kurum_yoneticisi'
  | 'okul_yoneticisi'
  | 'mudur_yardimcisi'
  | 'ogretmen'
  | 'rehberlik'
  | 'koc_ogretmen'
  | 'veli'
  | 'ogrenci'
  | 'personel';

export interface UserProfile {
  id: string;
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
  created_at: string;
}

export const ROLE_LABELS: Record<AppRole, string> = {
  super_admin: 'Süper Admin',
  kurum_yoneticisi: 'Kurum Yöneticisi',
  okul_yoneticisi: 'Okul Yöneticisi',
  mudur_yardimcisi: 'Müdür Yardımcısı',
  ogretmen: 'Öğretmen',
  rehberlik: 'Rehberlik',
  koc_ogretmen: 'Koç Öğretmen',
  veli: 'Veli',
  ogrenci: 'Öğrenci',
  personel: 'Personel',
};

export const ADMIN_ROLES: AppRole[] = ['super_admin', 'kurum_yoneticisi', 'okul_yoneticisi'];

export interface MenuItem {
  title: string;
  icon: string;
  path: string;
  roles: AppRole[];
  children?: MenuItem[];
}
