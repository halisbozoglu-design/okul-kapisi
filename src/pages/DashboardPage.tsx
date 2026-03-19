import { useAuth } from '@/hooks/useAuth';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { SuperAdminDashboard } from './dashboards/SuperAdminDashboard';
import { SchoolAdminDashboard } from './dashboards/SchoolAdminDashboard';
import { TeacherDashboard } from './dashboards/TeacherDashboard';
import { ParentDashboard } from './dashboards/ParentDashboard';
import { StudentDashboard } from './dashboards/StudentDashboard';

export default function DashboardPage() {
  const { roles } = useAuth();

  const getDashboard = () => {
    if (roles.includes('super_admin') || roles.includes('kurum_yoneticisi')) {
      return <SuperAdminDashboard />;
    }
    if (roles.includes('okul_yoneticisi') || roles.includes('mudur_yardimcisi')) {
      return <SchoolAdminDashboard />;
    }
    if (roles.includes('ogretmen') || roles.includes('rehberlik') || roles.includes('koc_ogretmen')) {
      return <TeacherDashboard />;
    }
    if (roles.includes('veli')) {
      return <ParentDashboard />;
    }
    if (roles.includes('ogrenci')) {
      return <StudentDashboard />;
    }
    return <SchoolAdminDashboard />;
  };

  return <AdminLayout>{getDashboard()}</AdminLayout>;
}
