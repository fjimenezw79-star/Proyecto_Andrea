import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { AuthProvider, useAuth } from "./auth/AuthProvider";
import { LoginPage } from "./auth/LoginPage";
import { RequireAuth } from "./auth/RequireAuth";
import { AuthError } from "./lib/api";
import { AppShell } from "./shell/AppShell";
import { Placeholder } from "./ui/Placeholder";
import { ToastProvider } from "./ui/Toast";
import { PosPage } from "./pos/PosPage";
import { InventoryPage } from "./inventory/InventoryPage";
import { ProductDetail } from "./inventory/ProductDetail";

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
      <Routes>
        <Route path="/entrar" element={<LoginPage />} />
        <Route element={<RequireAuth><AppShell /></RequireAuth>}>
          <Route index element={<Navigate to="/vender" replace />} />
          <Route path="vender" element={<PosPage />} />
          <Route path="inventario" element={<InventoryPage />} />
          <Route path="inventario/:id" element={<ProductDetail />} />
          <Route path="ventas" element={<Placeholder title="Ventas de hoy" />} />
          <Route path="productos/nuevo" element={<RequireAuth admin><Placeholder title="Nuevo producto" /></RequireAuth>} />
          <Route path="categorias" element={<RequireAuth admin><Placeholder title="Categorías" /></RequireAuth>} />
          <Route path="configuracion" element={<RequireAuth admin><Placeholder title="Configuración" /></RequireAuth>} />
          <Route path="*" element={<Navigate to="/vender" replace />} />
        </Route>
      </Routes>
    </QueryClientProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Routed />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
