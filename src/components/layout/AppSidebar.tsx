import {
  LayoutDashboard,
  Building2,
  Users,
  GraduationCap,
  BookOpen,
  CalendarDays,
  School,
  Layers,
  DoorOpen,
  GitBranch,
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
import { useAuthorization } from '@/hooks/useAuthorization';
import { PERMISSIONS } from '@/lib/auth/permissions';
import type { AppRole } from '@/types/auth';
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

interface PermissionRequirement {
  resource: string;
  action: string;
}

interface NavItem {
  title: string;
  url: string;
  icon: React.ElementType;
  roles?: AppRole[];
  permission?: PermissionRequirement;
}

const mainItems: NavItem[] = [
  { title: 'Dashboard', url: '/dashboard', icon: LayoutDashboard },
];

const adminItems: NavItem[] = [
  { title: 'Kullanıcı & Yetki', url: '/admin/access', icon: Users, permission: PERMISSIONS.ACCESS_MANAGE },
  { title: 'Özel Yetkiler', url: '/admin/access/permissions', icon: ShieldCheck, permission: PERMISSIONS.ACCESS_MANAGE },
];

const settingsItems: NavItem[] = [
  { title: 'Kurumlar', url: '/settings/institutions', icon: Building2, permission: PERMISSIONS.ACCESS_MANAGE },
  { title: 'Kampüsler', url: '/settings/campuses', icon: School, permission: PERMISSIONS.SETTINGS_MANAGE },
  { title: 'Akademik Yıllar', url: '/settings/academic-years', icon: CalendarDays, permission: PERMISSIONS.SETTINGS_MANAGE },
  { title: 'Dönemler', url: '/settings/terms', icon: BookOpen, permission: PERMISSIONS.SETTINGS_MANAGE },
  { title: 'Sınıf Düzeyleri', url: '/settings/grade-levels', icon: Layers, permission: PERMISSIONS.SETTINGS_MANAGE },
  { title: 'Şubeler', url: '/settings/sections', icon: GraduationCap, permission: PERMISSIONS.SETTINGS_MANAGE },
  { title: 'Derslikler', url: '/settings/classrooms', icon: DoorOpen, permission: PERMISSIONS.SETTINGS_MANAGE },
  { title: 'Branşlar', url: '/settings/branches', icon: GitBranch, permission: PERMISSIONS.SETTINGS_MANAGE },
];

const transportItems: NavItem[] = [
  { title: 'Panel', url: '/transport', icon: Bus, permission: PERMISSIONS.TRANSPORT_VIEW },
  { title: 'Araçlar', url: '/transport/vehicles', icon: Bus, permission: PERMISSIONS.TRANSPORT_MANAGE },
  { title: 'Şoför / Rehber', url: '/transport/staff', icon: IdCard, permission: PERMISSIONS.TRANSPORT_MANAGE },
  { title: 'Hatlar & Duraklar', url: '/transport/routes', icon: RouteIcon, permission: PERMISSIONS.TRANSPORT_MANAGE },
  { title: 'Öğrenci Atama', url: '/transport/students', icon: UserSquare2, permission: PERMISSIONS.TRANSPORT_MANAGE },
  { title: 'Canlı Takip', url: '/transport/live', icon: Radio, permission: PERMISSIONS.TRANSPORT_LIVE_TRACK },
  { title: 'Seferler', url: '/transport/trips', icon: History, permission: PERMISSIONS.TRANSPORT_MANAGE },
  {
    title: 'Şoför Ekranı',
    url: '/transport/driver',
    icon: Smartphone,
    roles: ['super_admin', 'kurum_yoneticisi', 'okul_yoneticisi', 'mudur_yardimcisi', 'personel'],
  },
  {
    title: 'Veli Servis Takibi',
    url: '/transport/parent',
    icon: UserSquare2,
    permission: PERMISSIONS.TRANSPORT_PARENT_VIEW,
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

function NavGroup({ label, items, collapsed }: { label: string; items: NavItem[]; collapsed: boolean }) {
  if (!items.length) return null;
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.url}>
              <SidebarMenuButton asChild>
                <NavLink
                  to={item.url}
                  end={item.url === '/transport'}
                  className="hover:bg-sidebar-accent"
                  activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                >
                  <item.icon className="mr-2 h-4 w-4" />
                  {!collapsed && <span>{item.title}</span>}
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  useLocation();
  const { hasAnyRole } = useAuth();
  const { hasPermission, hasTenantRole, loading: authorizationLoading } = useAuthorization();

  const canSee = (item: NavItem) => {
    if (item.permission && !hasPermission(item.permission.resource, item.permission.action)) return false;
    if (item.roles?.length) {
      return item.roles.some((role) => hasTenantRole(role)) || hasAnyRole(item.roles);
    }
    return true;
  };

  const filterItems = (items: NavItem[]) => (authorizationLoading ? [] : items.filter(canSee));

  const visibleMain = filterItems(mainItems);
  const visibleAdmin = filterItems(adminItems);
  const visibleSettings = filterItems(settingsItems);
  const visibleTransport = filterItems(transportItems);
  const visibleSecurity = filterItems(securityItems);

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <div className="p-4">
          {!collapsed ? (
            <div className="flex items-center gap-2">
              <School className="h-7 w-7 text-sidebar-primary" />
              <span className="text-lg font-bold text-sidebar-foreground">MİMAROS</span>
            </div>
          ) : (
            <School className="h-7 w-7 text-sidebar-primary mx-auto" />
          )}
        </div>

        <NavGroup label="Ana Menü" items={visibleMain} collapsed={collapsed} />
        <NavGroup label="Yönetim" items={visibleAdmin} collapsed={collapsed} />
        <NavGroup label="Kurum Ayarları" items={visibleSettings} collapsed={collapsed} />
        <NavGroup label="Servis Yönetimi" items={visibleTransport} collapsed={collapsed} />
        <NavGroup label="Güvenlik & Ziyaretçi" items={visibleSecurity} collapsed={collapsed} />
      </SidebarContent>
    </Sidebar>
  );
}
