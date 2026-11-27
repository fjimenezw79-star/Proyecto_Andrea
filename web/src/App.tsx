import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { AuthProvider, useAuth } from "./auth/AuthProvider";
import { LoginPage } from "./auth/LoginPage";
import { RequireAuth } from "./auth/RequireAuth";
import { AuthError } from "./lib/api";
import { ToastProvider } from "./ui/Toast";

function makeClient(onAuth: () => void) {
  const retry = (n: number, e: unknown) => !(e instanceof AuthError) && n < 1;
  const qc = new QueryClient({ defaultOptions: { queries: { retry, staleTime: 15_000, refetchOnWindowFocus: true } } });
  const handle = (e: unknown) => e instanceof AuthError && onAuth();
  qc.getQueryCache().config.onError = handle;
  qc.getMutationCache().config.onError = handle;
  return qc;
}

function Home() {
  const { user, logout } = useAuth();
  return (
    <main className="p-6">
      <p className="text-muted">Sesión iniciada como</p>
      <p className="font-serif text-4xl">{user?.full_name}</p>
      <button className="mt-4 underline" onClick={() => logout()}>
        Salir
      </button>
    </main>
  );
}

function Routed() {
  const { expire } = useAuth();
  const [qc] = [makeClientOnce(expire)];
  return (
    <QueryClientProvider client={qc}>
      <Routes>
        <Route path="/entrar" element={<LoginPage />} />
        <Route path="/" element={<Navigate to="/vender" replace />} />
        <Route path="*" element={<RequireAuth><Home /></RequireAuth>} />
      </Routes>
    </QueryClientProvider>
  );
}

let client: QueryClient | null = null;
function makeClientOnce(onAuth: () => void) {
  if (!client) client = makeClient(onAuth);
  return client;
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
