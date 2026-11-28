import * as Switch from "@radix-ui/react-switch";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import { KeyRound, Pencil, UserPlus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { api, ApiError } from "../lib/api";
import { dateMx } from "../lib/opTypes";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Dialog";
import { Field } from "../ui/Input";
import { useToast } from "../ui/Toast";

type Role = "admin" | "seller";
type SysUser = { id: number; username: string; name: string; full_name: string; role: Role; active: boolean; created_at: string | null; is_me: boolean };
const ROLE_LABEL: Record<Role, string> = { admin: "Administrador", seller: "Vendedor" };
type Dialog = { kind: "new" } | { kind: "edit"; user: SysUser } | { kind: "password"; user: SysUser } | null;

/** Usuarios del sistema: alta, cambio de nombre o rol, restablecer contraseña y desactivar. */
export function UsersPage() {
  const reduce = useReducedMotion();
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["users"], queryFn: () => api<{ users: SysUser[] }>("/api/users") });
  const [dialog, setDialog] = useState<Dialog>(null);

  async function setActive(u: SysUser, active: boolean) {
    try {
      const d = await api<{ message: string }>(`/api/users/${u.id}`, { method: "PATCH", json: { active } });
      toast(d.message, "ok");
      qc.invalidateQueries({ queryKey: ["users"] });
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "No se pudo guardar.", "error");
    }
  }

  return (
    <section className="mx-auto max-w-4xl px-4 pb-16 pt-6 md:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-5xl leading-none md:text-6xl">Usuarios</h1>
          <p className="mt-2 max-w-prose text-muted">Cada persona con su propio usuario: así se sabe quién vendió, cobró o cambió algo.</p>
        </div>
        <Button onClick={() => setDialog({ kind: "new" })}><UserPlus className="size-5" aria-hidden /> Nuevo usuario</Button>
      </div>
      {q.isLoading ? (
        <p className="mt-8 text-muted">Cargando…</p>
      ) : (
        <ul aria-label="Usuarios" className="mt-8 grid gap-3">
          {(q.data?.users ?? []).map((u, i) => (
            <motion.li key={u.id} initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduce ? 0 : Math.min(i, 8) * 0.03 }}
              className={`flex flex-wrap items-center gap-x-4 gap-y-3 rounded-3xl border border-line p-4 ${u.active ? "" : "bg-surface"}`}>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{u.name}{u.is_me && <span className="text-muted"> · tú</span>}</p>
                <p className="text-sm text-muted">
                  Usuario <span className="font-semibold text-ink">{u.username}</span> · {ROLE_LABEL[u.role]}
                  {u.created_at ? ` · desde ${dateMx(u.created_at)}` : ""}
                  {!u.active && <span className="font-semibold text-wine"> · Desactivado</span>}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: "password", user: u })} aria-label={`Restablecer contraseña de ${u.username}`}>
                  <KeyRound className="size-4" aria-hidden /> Contraseña
                </Button>
                <Button size="sm" variant="quiet" onClick={() => setDialog({ kind: "edit", user: u })} aria-label={`Editar ${u.username}`}>
                  <Pencil className="size-4" aria-hidden /> Editar
                </Button>
                {!u.is_me && (
                  <label className="flex items-center gap-2 text-sm font-semibold">
                    <Switch.Root checked={u.active} onCheckedChange={(v) => setActive(u, v)} aria-label={`${u.username} activo`}
                      className="relative h-7 w-12 shrink-0 rounded-full bg-line transition-colors data-[state=checked]:bg-ink">
                      <Switch.Thumb className="block size-6 translate-x-0.5 rounded-full bg-paper shadow transition-transform data-[state=checked]:translate-x-[22px]" />
                    </Switch.Root>
                    Activo
                  </label>
                )}
              </div>
            </motion.li>
          ))}
        </ul>
      )}
      <p className="mt-6 text-sm text-muted">
        Desactivar no borra nada: sus ventas y movimientos se conservan, solo ya no puede entrar. Si olvidas la contraseña del administrador,
        usa <code>restablecer_contrasena.bat</code> en la computadora del negocio.
      </p>
      <UserDialog dialog={dialog} onClose={() => setDialog(null)} />
    </section>
  );
}

function UserDialog({ dialog, onClose }: { dialog: Dialog; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState({ username: "", full_name: "", role: "seller" as Role, password: "", confirm: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [openedFor, setOpenedFor] = useState<Dialog>(null);
  if (dialog !== openedFor) {
    setOpenedFor(dialog);
    setErrors({});
    const u = dialog && dialog.kind !== "new" ? dialog.user : null;
    setForm({ username: u?.username ?? "", full_name: u?.full_name || u?.name || "", role: u?.role ?? "seller", password: "", confirm: "" });
  }
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const title = !dialog ? "" : dialog.kind === "new" ? "Nuevo usuario" : dialog.kind === "edit" ? `Editar ${dialog.user.username}` : `Contraseña de ${dialog.user.username}`;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!dialog) return;
    const needPw = dialog.kind !== "edit";
    if (needPw && form.password !== form.confirm) return setErrors({ confirm: "Las contraseñas no coinciden." });
    setBusy(true);
    setErrors({});
    try {
      const d =
        dialog.kind === "new"
          ? await api<{ message: string }>("/api/users", { method: "POST", json: { username: form.username, full_name: form.full_name, role: form.role, password: form.password } })
          : dialog.kind === "edit"
            ? await api<{ message: string }>(`/api/users/${dialog.user.id}`, { method: "PATCH", json: { full_name: form.full_name, role: form.role } })
            : await api<{ message: string }>(`/api/users/${dialog.user.id}/password`, { method: "POST", json: { password: form.password } });
      toast(d.message, "ok");
      qc.invalidateQueries({ queryKey: ["users"] });
      onClose();
    } catch (err) {
      if (err instanceof ApiError) setErrors({ [err.field ?? "form"]: err.message });
      else setErrors({ form: "No se pudo guardar." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={!!dialog} onOpenChange={(o) => !o && onClose()} title={title}>
      {dialog && (
        <form onSubmit={submit} className="grid gap-4" noValidate>
          {dialog.kind === "password" && (
            <p className="text-muted">Escribe la contraseña nueva para <strong className="text-ink">{dialog.user.name}</strong>. No hace falta saber la anterior; también se desbloquea si se equivocó varias veces.</p>
          )}
          {dialog.kind === "new" && (
            <Field label="Usuario (para entrar)" value={form.username} onChange={(e) => set("username", e.target.value.toLowerCase())} error={errors.username} autoFocus autoComplete="off" hint="Sin espacios ni acentos, por ejemplo maria o jose.luis" />
          )}
          {dialog.kind !== "password" && (
            <>
              <Field label="Nombre" value={form.full_name} onChange={(e) => set("full_name", e.target.value)} error={errors.full_name} autoFocus={dialog.kind === "edit"} maxLength={120} />
              <div role="radiogroup" aria-label="Rol" className="flex flex-wrap gap-2">
                {(["seller", "admin"] as Role[]).map((r) => (
                  <label key={r} className={`cursor-pointer rounded-full border px-4 py-2 font-semibold ${form.role === r ? "border-ink bg-ink text-paper" : "border-line hover:bg-surface"}`}>
                    <input type="radio" name="role" className="sr-only" checked={form.role === r} onChange={() => set("role", r)} />
                    {ROLE_LABEL[r]}
                  </label>
                ))}
              </div>
              {errors.role && <p className="text-sm font-semibold text-danger">{errors.role}</p>}
              <p className="text-sm text-muted">El vendedor vende, aparta, cobra abonos, da de alta clientes, escanea e imprime etiquetas. El administrador además maneja productos, precios, reportes, gastos, usuarios y configuración.</p>
            </>
          )}
          {dialog.kind !== "edit" && (
            <>
              <Field label={dialog.kind === "new" ? "Contraseña" : "Contraseña nueva"} type="password" autoComplete="new-password" value={form.password} onChange={(e) => set("password", e.target.value)} error={errors.password} hint="6 caracteres o más" autoFocus={dialog.kind === "password"} />
              <Field label="Repite la contraseña" type="password" autoComplete="new-password" value={form.confirm} onChange={(e) => set("confirm", e.target.value)} error={errors.confirm} />
            </>
          )}
          {errors.form && <p role="alert" className="rounded-xl bg-danger/10 px-4 py-3 text-sm font-semibold text-danger">{errors.form}</p>}
          {errors.active && <p role="alert" className="text-sm font-semibold text-danger">{errors.active}</p>}
          <Button type="submit" size="lg" disabled={busy}>
            {busy ? "Guardando…" : dialog.kind === "new" ? "Crear usuario" : dialog.kind === "edit" ? "Guardar cambios" : "Restablecer contraseña"}
          </Button>
        </form>
      )}
    </Modal>
  );
}
