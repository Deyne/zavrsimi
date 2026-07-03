import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore();
  const location = useLocation();

  if (!user) {
    return <Navigate to="/prijava" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
