import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useAuthorization } from '@/hooks/useAuthorization';
import { AppRole } from '@/types/auth';
import { PwaInstallPrompt } from '@/components/common/PwaInstallPrompt';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRoles?: AppRole[];
  requiredPermission?: { resource: string; action: string };
}

export function ProtectedRoute({ children, requiredRoles, requiredPermission }: ProtectedRouteProps) {
  const { user, loading, roles, isActive } = useAuth();
  const authorization = useAuthorization();

  if (loading || (requiredPermission && authorization.loading)) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!isActive) {
    return <Navigate to="/inactive" replace />;
  }

  if (roles.length === 0 && authorization.roles.length === 0 && !authorization.isSuperAdmin) {
    return <Navigate to="/no-role" replace />;
  }

  if (requiredRoles && requiredRoles.length > 0) {
    const hasAccess = requiredRoles.some(
      (role) => authorization.hasTenantRole(role) || roles.includes(role),
    );
    if (!hasAccess) {
      return <Navigate to="/unauthorized" replace />;
    }
  }

  if (requiredPermission && !authorization.hasPermission(requiredPermission.resource, requiredPermission.action)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return (
    <>
      {children}
      <PwaInstallPrompt />
    </>
  );
}
