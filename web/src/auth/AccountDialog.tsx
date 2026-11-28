import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../lib/api";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Dialog";
import { Field } from "../ui/Input";
import { useToast } from "../ui/Toast";
import { useAuth } from "./AuthProvider";

export function AccountDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setCurrent("");
      setNext("");
      setAgain("");
      setErrors({});
    }
  }, [open]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (next !== again) return setErrors({ again: "Las contraseñas no coinciden." });
    setBusy(true);
    setErrors({});
    try {
      await api("/api/auth/password", { method: "POST", json: { current, new: next } });
      toast("Contraseña actualizada.", "ok");
      onOpenChange(false);
    } catch (err) {
      const a = err instanceof ApiError ? err : null;
      setErrors({ [a?.field ?? "form"]: a?.message ?? "No se pudo cambiar la contraseña." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Mi cuenta">
      <p className="mb-4 text-muted">
        {user?.full_name || user?.username} · {user?.role === "admin" ? "Administrador" : "Vendedor"}
      </p>
      <form onSubmit={save} className="grid gap-4" noValidate>
        <Field label="Contraseña actual" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} error={errors.current} autoFocus />
        <Field label="Contraseña nueva" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} error={errors.new} hint="Al menos 6 caracteres. Es necesaria para entrar por internet." />
        <Field label="Repite la contraseña nueva" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} error={errors.again} />
        {errors.form && <p role="alert" className="text-sm font-semibold text-danger">{errors.form}</p>}
        <Button type="submit" size="lg" disabled={busy || !current || !next}>{busy ? "Guardando…" : "Cambiar contraseña"}</Button>
      </form>
    </Modal>
  );
}
