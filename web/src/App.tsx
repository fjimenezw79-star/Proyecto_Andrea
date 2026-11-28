import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { MotionConfig } from "motion/react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { AuthProvider, useAuth } from "./auth/AuthProvider";
import { LoginPage } from "./auth/LoginPage";
import { RequireAuth } from "./auth/RequireAuth";
import { AuthError } from "./lib/api";
import { AppShell } from "./shell/AppShell";
import { OfflineProvider } from "./offline/OfflineProvider";
import { ToastProvider } from "./ui/Toast";
import { PosPage } from "./pos/PosPage";
import { InventoryPage } from "./inventory/InventoryPage";
import { ProductDetail } from "./inventory/ProductDetail";
import { NewProductWizard } from "./products/NewProductWizard";
import { CategoriesPage } from "./admin/CategoriesPage";
import { SalesTodayPage } from "./admin/SalesTodayPage";
import { SettingsPage } from "./admin/SettingsPage";
import { ClientDetail } from "./clients/ClientDetail";
import { ClientsPage } from "./clients/ClientsPage";
import { LayawayDetail } from "./layaways/LayawayDetail";
import { LayawaysPage } from "./layaways/LayawaysPage";
import { CashPage } from "./cash/CashPage";
import { DashboardPage } from "./admin/DashboardPage";
import { ExpensesPage } from "./admin/ExpensesPage";
import { ReportsPage } from "./admin/ReportsPage";
import { ConnectPage } from "./admin/ConnectPage";

function Routed() {
  const { expire } = useAuth();
  const [qc] = useState(() => {
    const retry = (n: number, e: unknown) => !(e instanceof AuthError) && n < 1;
    const c = new QueryClient({ defaultOptions: { queries: { retry, staleTime: 15_000 }, mutations: { retry: false } } });
    const onError = (e: unknown) => e instanceof AuthError && expire();
    c.getQueryCache().config.onError = onError;
    c.getMutationCache().config.onError = onError;
    return c;
  });
  return (
    <QueryClientProvider client={qc}>
      <OfflineProvider>
      <Routes>
        <Route path="/entrar" element={<LoginPage />} />
        <Route element={<RequireAuth><AppShell /></RequireAuth>}>
          <Route index element={<Navigate to="/vender" replace />} />
          <Route path="vender" element={<PosPage />} />
          <Route path="inventario" element={<InventoryPage />} />
          <Route path="inventario/:id" element={<ProductDetail />} />
          <Route path="ventas" element={<SalesTodayPage />} />
          <Route path="apartados" element={<LayawaysPage />} />
          <Route path="apartados/:id" element={<LayawayDetail />} />
          <Route path="clientes" element={<ClientsPage />} />
          <Route path="clientes/:id" element={<ClientDetail />} />
          <Route path="caja" element={<CashPage />} />
          <Route path="panel" element={<RequireAuth admin><DashboardPage /></RequireAuth>} />
          <Route path="reportes" element={<RequireAuth admin><ReportsPage /></RequireAuth>} />
          <Route path="gastos" element={<RequireAuth admin><ExpensesPage /></RequireAuth>} />
          <Route path="productos/nuevo" element={<RequireAuth admin><NewProductWizard /></RequireAuth>} />
          <Route path="categorias" element={<RequireAuth admin><CategoriesPage /></RequireAuth>} />
          <Route path="conectar" element={<RequireAuth admin><ConnectPage /></RequireAuth>} />
          <Route path="configuracion" element={<RequireAuth admin><SettingsPage /></RequireAuth>} />
          <Route path="*" element={<Navigate to="/vender" replace />} />
        </Route>
      </Routes>
      </OfflineProvider>
    </QueryClientProvider>
  );
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Routed />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
    </MotionConfig>
  );
}
