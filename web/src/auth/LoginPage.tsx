import { motion } from "motion/react";
import { useState, type FormEvent } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router";
import { ApiError } from "../lib/api";
import { Button } from "../ui/Button";
import { Field } from "../ui/Input";
import { useAuth } from "./AuthProvider";

export function LoginPage() {
  const { user, ready, login } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const back = params.get("volver");
  const target = back && back.startsWith("/") && !back.startsWith("//") ? back : "/vender";

  if (ready && user) return <Navigate to={target} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(username.trim(), password);
      navigate(target, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo iniciar sesión.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-full lg:grid-cols-[1.1fr_.9fr]">
      <section className="relative hidden overflow-hidden bg-night text-white lg:flex lg:flex-col lg:justify-end lg:p-14">
        <motion.img
          src="/logo_ma.webp"
          alt=""
          className="absolute left-1/2 top-[42%] w-[min(440px,70%)] -translate-x-1/2 -translate-y-1/2 [mask-image:radial-gradient(closest-side,#000_70%,transparent)]"
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.9, ease: [0.2, 0.8, 0.2, 1] }}
        />
        <p className="relative max-w-sm font-serif text-4xl leading-tight">Para la escuela, la casa y las noches frías.</p>
      </section>
      <section className="flex items-center justify-center px-[max(20px,env(safe-area-inset-left,0px))] py-12">
        <motion.div
          className="w-full max-w-sm"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
        >
          <img src="/logo_ma.webp" alt="" className="mb-6 size-16 rounded-full bg-night object-cover lg:hidden" />
          <h1 className="font-serif text-6xl leading-none">Modas Andrea</h1>
          <p className="mb-10 mt-2 text-muted">Yuda · Sistema de ventas</p>
          <form onSubmit={submit} className="grid gap-5" noValidate>
            <Field label="Usuario" autoComplete="username" autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value)} required />
            <Field label="Contraseña" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            {error && (
              <p role="alert" className="rounded-xl bg-danger/10 px-4 py-3 text-sm font-semibold text-danger">
                {error}
              </p>
            )}
            <Button type="submit" size="lg" disabled={busy || !username || !password}>
              {busy ? "Entrando…" : "Entrar"}
            </Button>
          </form>
        </motion.div>
      </section>
    </main>
  );
}
