import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

import LoginPage from "./pages/auth/LoginPage";
import RegisterPage from "./pages/auth/RegisterPage";
import ForgotPasswordPage from "./pages/auth/ForgotPasswordPage";
import ResetPasswordPage from "./pages/auth/ResetPasswordPage";
import InactivePage from "./pages/auth/InactivePage";
import NoRolePage from "./pages/auth/NoRolePage";
import UnauthorizedPage from "./pages/auth/UnauthorizedPage";

import DashboardPage from "./pages/DashboardPage";
import InstitutionsPage from "./pages/settings/InstitutionsPage";
import CampusesPage from "./pages/settings/CampusesPage";
import AcademicYearsPage from "./pages/settings/AcademicYearsPage";
import TermsPage from "./pages/settings/TermsPage";
import GradeLevelsPage from "./pages/settings/GradeLevelsPage";
import SectionsPage from "./pages/settings/SectionsPage";
import ClassroomsPage from "./pages/settings/ClassroomsPage";
import BranchesPage from "./pages/settings/BranchesPage";
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

const queryClient = new QueryClient();

const ADMIN_ROLES = ['super_admin', 'kurum_yoneticisi', 'okul_yoneticisi'] as const;
const TRANSPORT_ROLES = ['super_admin', 'kurum_yoneticisi', 'okul_yoneticisi', 'mudur_yardimcisi'] as const;

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* Public routes */}
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/inactive" element={<InactivePage />} />
            <Route path="/no-role" element={<NoRolePage />} />
            <Route path="/unauthorized" element={<UnauthorizedPage />} />

            {/* Protected routes */}
            <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
            
            {/* Settings routes - admin only */}
            <Route path="/settings/institutions" element={<ProtectedRoute requiredRoles={['super_admin', 'kurum_yoneticisi']}><InstitutionsPage /></ProtectedRoute>} />
            <Route path="/settings/campuses" element={<ProtectedRoute requiredRoles={[...ADMIN_ROLES]}><CampusesPage /></ProtectedRoute>} />
            <Route path="/settings/academic-years" element={<ProtectedRoute requiredRoles={[...ADMIN_ROLES]}><AcademicYearsPage /></ProtectedRoute>} />
            <Route path="/settings/terms" element={<ProtectedRoute requiredRoles={[...ADMIN_ROLES]}><TermsPage /></ProtectedRoute>} />
            <Route path="/settings/grade-levels" element={<ProtectedRoute requiredRoles={[...ADMIN_ROLES]}><GradeLevelsPage /></ProtectedRoute>} />
            <Route path="/settings/sections" element={<ProtectedRoute requiredRoles={[...ADMIN_ROLES]}><SectionsPage /></ProtectedRoute>} />
            <Route path="/settings/classrooms" element={<ProtectedRoute requiredRoles={[...ADMIN_ROLES]}><ClassroomsPage /></ProtectedRoute>} />
            <Route path="/settings/branches" element={<ProtectedRoute requiredRoles={[...ADMIN_ROLES]}><BranchesPage /></ProtectedRoute>} />

            {/* Transport module */}
            <Route path="/transport" element={<ProtectedRoute requiredRoles={[...TRANSPORT_ROLES]}><TransportDashboardPage /></ProtectedRoute>} />
            <Route path="/transport/vehicles" element={<ProtectedRoute requiredRoles={[...TRANSPORT_ROLES]}><VehiclesPage /></ProtectedRoute>} />
            <Route path="/transport/staff" element={<ProtectedRoute requiredRoles={[...TRANSPORT_ROLES]}><TransportStaffPage /></ProtectedRoute>} />
            <Route path="/transport/routes" element={<ProtectedRoute requiredRoles={[...TRANSPORT_ROLES]}><RoutesPage /></ProtectedRoute>} />
            <Route path="/transport/students" element={<ProtectedRoute requiredRoles={[...TRANSPORT_ROLES]}><StudentAssignmentsPage /></ProtectedRoute>} />
            <Route path="/transport/live" element={<ProtectedRoute requiredRoles={[...TRANSPORT_ROLES]}><LiveTrackingPage /></ProtectedRoute>} />
            <Route path="/transport/trips" element={<ProtectedRoute requiredRoles={[...TRANSPORT_ROLES]}><TripsPage /></ProtectedRoute>} />
            <Route path="/transport/driver" element={<ProtectedRoute><DriverPage /></ProtectedRoute>} />
            <Route path="/transport/parent" element={<ProtectedRoute requiredRoles={['veli', 'super_admin', 'kurum_yoneticisi', 'okul_yoneticisi']}><ParentPage /></ProtectedRoute>} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
