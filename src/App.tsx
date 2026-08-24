import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { PERMISSIONS } from "@/lib/auth/permissions";

import LoginPage from "./pages/auth/LoginPage";
import RegisterPage from "./pages/auth/RegisterPage";
import ForgotPasswordPage from "./pages/auth/ForgotPasswordPage";
import ResetPasswordPage from "./pages/auth/ResetPasswordPage";
import InactivePage from "./pages/auth/InactivePage";
import NoRolePage from "./pages/auth/NoRolePage";
import UnauthorizedPage from "./pages/auth/UnauthorizedPage";
import InviteAcceptPage from "./pages/auth/InviteAcceptPage";

import DashboardPage from "./pages/DashboardPage";
import InstitutionsPage from "./pages/settings/InstitutionsPage";
import CampusesPage from "./pages/settings/CampusesPage";
import AcademicYearsPage from "./pages/settings/AcademicYearsPage";
import TermsPage from "./pages/settings/TermsPage";
import GradeLevelsPage from "./pages/settings/GradeLevelsPage";
import SectionsPage from "./pages/settings/SectionsPage";
import ClassroomsPage from "./pages/settings/ClassroomsPage";
import BranchesPage from "./pages/settings/BranchesPage";
import AccessManagementPage from "./pages/admin/AccessManagementPage";
import NotFound from "./pages/NotFound";

import TransportDashboardPage from "./pages/transport/TransportDashboardPage";
import VehiclesPage from "./pages/transport/VehiclesPage";
import TransportStaffPage from "./pages/transport/TransportStaffPage";
import RoutesPage from "./pages/transport/RoutesPage";
import StudentAssignmentsPage from "./pages/transport/StudentAssignmentsPage";
import LiveTrackingPage from "./pages/transport/LiveTrackingPage";
import TripsPage from "./pages/transport/TripsPage";
import DriverPage from "./pages/transport/DriverPage";
import ParentPage from "./pages/transport/ParentPage";

import SecurityCheckInPage from "./pages/security/SecurityCheckInPage";
import VisitorsInsidePage from "./pages/security/VisitorsInsidePage";
import VisitorLedgerPage from "./pages/security/VisitorLedgerPage";
import SecurityLocationsPage from "./pages/security/SecurityLocationsPage";
import StudentDutyPage from "./pages/security/StudentDutyPage";

const queryClient = new QueryClient();

const SECURITY_OPERATORS = ['super_admin', 'kurum_yoneticisi', 'okul_yoneticisi', 'mudur_yardimcisi', 'personel'] as const;
const SECURITY_MANAGERS = ['super_admin', 'kurum_yoneticisi', 'okul_yoneticisi', 'mudur_yardimcisi'] as const;

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* Public/auth routes */}
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/invite/accept" element={<InviteAcceptPage />} />
            <Route path="/inactive" element={<InactivePage />} />
            <Route path="/no-role" element={<NoRolePage />} />
            <Route path="/unauthorized" element={<UnauthorizedPage />} />

            <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />

            {/* Tenant access administration. */}
            <Route path="/admin/access" element={<ProtectedRoute requiredPermission={PERMISSIONS.ACCESS_MANAGE}><AccessManagementPage /></ProtectedRoute>} />

            {/* Institution/access administration is distinct from operational module management. */}
            <Route path="/settings/institutions" element={<ProtectedRoute requiredPermission={PERMISSIONS.ACCESS_MANAGE}><InstitutionsPage /></ProtectedRoute>} />
            <Route path="/settings/campuses" element={<ProtectedRoute requiredPermission={PERMISSIONS.SETTINGS_MANAGE}><CampusesPage /></ProtectedRoute>} />
            <Route path="/settings/academic-years" element={<ProtectedRoute requiredPermission={PERMISSIONS.SETTINGS_MANAGE}><AcademicYearsPage /></ProtectedRoute>} />
            <Route path="/settings/terms" element={<ProtectedRoute requiredPermission={PERMISSIONS.SETTINGS_MANAGE}><TermsPage /></ProtectedRoute>} />
            <Route path="/settings/grade-levels" element={<ProtectedRoute requiredPermission={PERMISSIONS.SETTINGS_MANAGE}><GradeLevelsPage /></ProtectedRoute>} />
            <Route path="/settings/sections" element={<ProtectedRoute requiredPermission={PERMISSIONS.SETTINGS_MANAGE}><SectionsPage /></ProtectedRoute>} />
            <Route path="/settings/classrooms" element={<ProtectedRoute requiredPermission={PERMISSIONS.SETTINGS_MANAGE}><ClassroomsPage /></ProtectedRoute>} />
            <Route path="/settings/branches" element={<ProtectedRoute requiredPermission={PERMISSIONS.SETTINGS_MANAGE}><BranchesPage /></ProtectedRoute>} />

            {/* Transport module: route UX follows DB-backed module permissions. */}
            <Route path="/transport" element={<ProtectedRoute requiredPermission={PERMISSIONS.TRANSPORT_VIEW}><TransportDashboardPage /></ProtectedRoute>} />
            <Route path="/transport/vehicles" element={<ProtectedRoute requiredPermission={PERMISSIONS.TRANSPORT_MANAGE}><VehiclesPage /></ProtectedRoute>} />
            <Route path="/transport/staff" element={<ProtectedRoute requiredPermission={PERMISSIONS.TRANSPORT_MANAGE}><TransportStaffPage /></ProtectedRoute>} />
            <Route path="/transport/routes" element={<ProtectedRoute requiredPermission={PERMISSIONS.TRANSPORT_MANAGE}><RoutesPage /></ProtectedRoute>} />
            <Route path="/transport/students" element={<ProtectedRoute requiredPermission={PERMISSIONS.TRANSPORT_MANAGE}><StudentAssignmentsPage /></ProtectedRoute>} />
            <Route path="/transport/live" element={<ProtectedRoute requiredPermission={PERMISSIONS.TRANSPORT_LIVE_TRACK}><LiveTrackingPage /></ProtectedRoute>} />
            <Route path="/transport/trips" element={<ProtectedRoute requiredPermission={PERMISSIONS.TRANSPORT_MANAGE}><TripsPage /></ProtectedRoute>} />
            {/* Driver access is additionally constrained by transport_staff / trip RLS in the DB. */}
            <Route path="/transport/driver" element={<ProtectedRoute><DriverPage /></ProtectedRoute>} />
            <Route path="/transport/parent" element={<ProtectedRoute requiredPermission={PERMISSIONS.TRANSPORT_PARENT_VIEW}><ParentPage /></ProtectedRoute>} />

            {/* Güvenlik & Ziyaretçi: next module to migrate to the same permission matrix. */}
            <Route path="/security/visitors/check-in" element={<ProtectedRoute requiredRoles={[...SECURITY_OPERATORS]}><SecurityCheckInPage /></ProtectedRoute>} />
            <Route path="/security/visitors/inside" element={<ProtectedRoute requiredRoles={[...SECURITY_OPERATORS]}><VisitorsInsidePage /></ProtectedRoute>} />
            <Route path="/security/visitors/ledger" element={<ProtectedRoute requiredRoles={[...SECURITY_OPERATORS]}><VisitorLedgerPage /></ProtectedRoute>} />
            <Route path="/security/locations" element={<ProtectedRoute requiredRoles={[...SECURITY_MANAGERS]}><SecurityLocationsPage /></ProtectedRoute>} />
            <Route path="/security/student-duty" element={<ProtectedRoute requiredRoles={[...SECURITY_MANAGERS, 'ogretmen']}><StudentDutyPage /></ProtectedRoute>} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
