import {
  LayoutDashboard,
  Building2,
  Settings,
  Users,
  GraduationCap,
  BookOpen,
  CalendarDays,
  School,
  Layers,
  DoorOpen,
  GitBranch,
  Shield,
  Bus,
  Route as RouteIcon,
  IdCard,
  Radio,
  History,
  UserSquare2,
  Smartphone,
  ScanFace,
  ClipboardList,
  ShieldCheck,
} from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { AppRole } from '@/types/auth';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';

interface NavItem {
  title: string;
  url: string;
  icon: React.ElementType;
  roles: AppRole[];
}

const mainItems: NavItem[] = [
  {
    title: 'Dashboard',
    url: '/dashboard',
    icon: LayoutDashboard,
    roles: ['super_admin', 'kurum_yoneticisi', 'okul_yoneticisi', 'mudur_yardimcisi', 'ogretmen', 'rehberlik', 'koc_ogretmen', 'veli', 'ogrenci', 'personel'],
  },
];

const settingsItems: NavItem[] = [
  { title: 'Kurumlar', url: '/settings/institutions', icon: Building2, roles: ['super_admin', 'kurum_yoneticisi'] },
  { title: 'Kampüsler', url: '/settings/campuses', icon: School, roles: ['super_admin', 'kurum_yoneticisi', 'okul_yoneticisi'] },
  { title: 'Akademik Yıllar', url: '/settings/academic-years', icon: CalendarDays, roles: ['super_admin', 'kurum_yoneticisi', 'okul_yoneticisi'] },
  { title: 'Dönemler', url: '/settings/terms', icon: BookOpen, roles: ['super_admin', 'kurum_yoneticisi', 'okul_yoneticisi'] },
  { title: 'Sınıf Düzeyleri', url: '/settings/grade-levels', icon: Layers, roles: ['super_admin', 'kurum_yoneticisi', 'okul_yoneticisi'] },
  { title: 'Şubeler', url: '/settings/sections', icon: GraduationCap, roles: ['super_admin', 'kurum_yoneticisi', 'okul_yoneticisi'] },
  { title: 'Derslikler', url: '/settings/classrooms', icon: DoorOpen, roles: ['super_admin', 'kurum_yoneticisi', 'okul_yoneticisi'] },
  { title: 'Branşlar', url: '/settings/branches', icon: GitBranch, roles: ['super_admin', 'kurum_yoneticisi', 'okul_yoneticisi'] },
];

const TRANSPORT_MANAGERS: AppRole[] = ['super_admin', 'kurum_yoneticisi', 'okul_yoneticisi', 'mudur_yardimcisi'];

const transportItems: NavItem[] = [
  { title: 'Panel', url: '/transport', icon: Bus, roles: TRANSPORT_MANAGERS },
  { title: 'Araçlar', url: '/transport/vehicles', icon: Bus, roles: TRANSPORT_MANAGERS },
  { title: 'Şoför / Rehber', url: '/transport/staff', icon: IdCard, roles: TRANSPORT_MANAGERS },
  { title: 'Hatlar & Duraklar', url: '/transport/routes', icon: RouteIcon, roles: TRANSPORT_MANAGERS },
  { title: 'Öğrenci Atama', url: '/transport/students', icon: UserSquare2, roles: TRANSPORT_MANAGERS },
  { title: 'Canlı Takip', url: '/transport/live', icon: Radio, roles: TRANSPORT_MANAGERS },
  { title: 'Seferler', url: '/transport/trips', icon: History, roles: TRANSPORT_MANAGERS },
  {
    title: 'Şoför Ekranı', url: '/transport/driver', icon: Smartphone,
    roles: [...TRANSPORT_MANAGERS, 'ogretmen', 'personel'],
  },
  {
    title: 'Veli Servis Takibi', url: '/transport/parent', icon: UserSquare2,
    roles: [...TRANSPORT_MANAGERS, 'veli'],
  },
];

const SECURITY_MANAGERS: AppRole[] = ['super_admin', 'kurum_yoneticisi', 'okul_yoneticisi', 'mudur_yardimcisi'];
const SECURITY_OPERATORS: AppRole[] = [...SECURITY_MANAGERS, 'personel'];

const securityItems: NavItem[] = [
  { title: 'Hızlı Ziyaretçi Girişi', url: '/security/visitors/check-in', icon: ScanFace, roles: SECURITY_OPERATORS },
  { title: 'İçeridekiler', url: '/security/visitors/inside', icon: Users, roles: SECURITY_OPERATORS },
  { title: 'Ziyaretçi Defteri', url: '/security/visitors/ledger', icon: ClipboardList, roles: SECURITY_OPERATORS },
  { title: 'Giriş / Nöbet Yerleri', url: '/security/locations', icon: DoorOpen, roles: SECURITY_MANAGERS },
  { title: 'Nöbetçi Öğrenci', url: '/security/student-duty', icon: ShieldCheck, roles: [...SECURITY_MANAGERS, 'ogretmen'] },
];

const adminItems: NavItem[] = [
  { title: 'Kullanıcı Yönetimi', url: '/admin/users', icon: Users, roles: ['super_admin'] },
  { title: 'Rol Yönetimi', url: '/admin/roles', icon: Shield, roles: ['super_admin'] },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const location = useLocation();
  const { roles, hasAnyRole } = useAuth();

  const filterByRole = (items: NavItem[]) =>
    items.filter(item => hasAnyRole(item.roles));

  const visibleMain = filterByRole(mainItems);
  const visibleSettings = filterByRole(settingsItems);
  const visibleTransport = filterByRole(transportItems);
  const visibleSecurity = filterByRole(securityItems);
  const visibleAdmin = filterByRole(adminItems);

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <div className="p-4">
          {!collapsed && (
            <div className="flex items-center gap-2">
              <School className="h-7 w-7 text-sidebar-primary" />
              <span className="text-lg font-bold text-sidebar-foreground">EduPanel</span>
            </div>
          )}
          {collapsed && <School className="h-7 w-7 text-sidebar-primary mx-auto" />}
        </div>

        {visibleMain.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Ana Menü</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {visibleMain.map(item => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild>
                      <NavLink to={item.url} className="hover:bg-sidebar-accent" activeClassName="bg-sidebar-accent text-sidebar-primary font-medium">
                        <item.icon className="mr-2 h-4 w-4" />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {visibleSettings.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Kurum Ayarları</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {visibleSettings.map(item => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild>
                      <NavLink to={item.url} className="hover:bg-sidebar-accent" activeClassName="bg-sidebar-accent text-sidebar-primary font-medium">
                        <item.icon className="mr-2 h-4 w-4" />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {visibleTransport.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Servis Yönetimi</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {visibleTransport.map(item => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild>
                      <NavLink to={item.url} end={item.url === '/transport'} className="hover:bg-sidebar-accent" activeClassName="bg-sidebar-accent text-sidebar-primary font-medium">
                        <item.icon className="mr-2 h-4 w-4" />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {visibleAdmin.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Yönetim</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {visibleAdmin.map(item => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild>
                      <NavLink to={item.url} className="hover:bg-sidebar-accent" activeClassName="bg-sidebar-accent text-sidebar-primary font-medium">
                        <item.icon className="mr-2 h-4 w-4" />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
    </Sidebar>
  );
}
