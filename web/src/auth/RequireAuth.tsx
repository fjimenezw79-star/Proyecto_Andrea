import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { useAuth } from "./AuthProvider";

export function RequireAuth({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  const { user, ready, isAdmin } = useAuth();
  const loc = useLocation();
  if (!ready) return <div className="grid min-h-full place-items-center text-muted">Cargando…</div>;
  if (!user) return <Navigate to={`/entrar?volver=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (admin && !isAdmin) return <Navigate to="/vender" replace />;
  return <>{children}</>;
}
