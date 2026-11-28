import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { api, ApiError } from "../lib/api";
import { formatMoney, parsePesos } from "../lib/money";
import { dateMx } from "../lib/opTypes";
import { Button } from "../ui/Button";
import { Field } from "../ui/Input";
import { useToast } from "../ui/Toast";

type Expense = { id: number; description: string; category: string; amount_cents: number; from_register: boolean; day: string; locked: boolean };

export function ExpensesPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["expenses"], queryFn: () => api<{ expenses: Expense[]; categories: string[] }>("/api/expenses") });
  const [desc, setDesc] = useState("");
  const [cat, setCat] = useState("");
  const [amount, setAmount] = useState("");
  const [fromRegister, setFromRegister] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const list = q.data?.expenses ?? [];
  const total = list.reduce((s, e) => s + e.amount_cents, 0);

  async function add(e: FormEvent) {
    e.preventDefault();
    const cents = parsePesos(amount);
    const errs: Record<string, string> = {};
    if (!desc.trim()) errs.description = "Escribe en qué se gastó.";
    if (!cat) errs.category = "Elige una categoría.";
    if (cents === null || cents <= 0) errs.amount_cents = "Escribe el monto.";
    setErrors(errs);
    if (Object.keys(errs).length || busy) return;
    setBusy(true);
    try {
      await api("/api/expenses", { method: "POST", json: { description: desc, category: cat, amount_cents: cents, from_register: fromRegister } });
      toast("Gasto registrado.", "ok");
      setDesc(""); setAmount(""); setFromRegister(false);
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["cash"] });
    } catch (err) {
      const a = err instanceof ApiError ? err : null;
      setErrors({ [a?.field ?? "form"]: a?.message ?? "No se pudo guardar." });
    } finally {
      setBusy(false);
    }
  }
  async function remove(x: Expense) {
    try {
      await api(`/api/expenses/${x.id}`, { method: "DELETE" });
      toast("Gasto eliminado.", "ok");
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["cash"] });
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "No se pudo eliminar.", "error");
    }
  }

  return (
    <section className="mx-auto max-w-4xl px-4 pb-12 pt-6 md:px-8">
      <h1 className="font-serif text-5xl leading-none md:text-6xl">Gastos</h1>
      <form onSubmit={add} className="mt-8 grid gap-4 rounded-3xl bg-surface p-5 sm:grid-cols-[2fr_1fr_1fr]" noValidate>
        <Field label="Concepto" value={desc} onChange={(e) => setDesc(e.target.value)} error={errors.description} placeholder="Recibo de luz" />
        <label className="grid gap-1.5 text-sm font-semibold">
          Categoría
          <select value={cat} onChange={(e) => setCat(e.target.value)} aria-invalid={errors.category ? true : undefined} className={`min-h-11 rounded-xl border bg-paper px-3 font-normal ${errors.category ? "border-danger" : "border-line"}`}>
            <option value="">Elige…</option>
            {(q.data?.categories ?? []).map((c) => <option key={c}>{c}</option>)}
          </select>
          {errors.category && <span className="text-sm font-normal text-danger">{errors.category}</span>}
        </label>
        <Field label="Monto" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} error={errors.amount_cents} />
        <label className="flex items-center gap-3 font-semibold sm:col-span-2">
          <input type="checkbox" checked={fromRegister} onChange={(e) => setFromRegister(e.target.checked)} className="size-5" />
          Se pagó con dinero de la caja
        </label>
        <Button type="submit" disabled={busy}>{busy ? "Guardando…" : "Registrar gasto"}</Button>
        {errors.form && <p role="alert" className="text-sm text-danger sm:col-span-3">{errors.form}</p>}
      </form>
      <p className="mt-8 flex items-baseline justify-between"><span className="font-serif text-3xl">Este mes</span><span className="tnum font-serif text-3xl">{formatMoney(total)}</span></p>
      <ul aria-label="Gastos" className="mt-3 grid gap-px overflow-hidden rounded-2xl border border-line bg-line">
        {list.map((x) => (
          <li key={x.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 bg-paper px-4 py-3">
            <span><span className="block font-semibold">{x.description}</span><span className="text-sm text-muted">{x.category} · {dateMx(x.day)}{x.from_register ? " · de la caja" : ""}</span></span>
            <span className="tnum font-bold">{formatMoney(x.amount_cents)}</span>
            {confirmId === x.id ? (
              <span className="flex gap-1"><Button size="sm" variant="danger" onClick={() => { setConfirmId(null); remove(x); }}>Eliminar</Button><Button size="sm" variant="quiet" onClick={() => setConfirmId(null)}>No</Button></span>
            ) : (
            <button disabled={x.locked} onClick={() => setConfirmId(x.id)} className="grid size-10 place-items-center rounded-full hover:bg-surface disabled:opacity-30" aria-label={`Eliminar ${x.description}`} title={x.locked ? "Salió de una caja ya cortada" : undefined}>
              <Trash2 className="size-4" aria-hidden />
            </button>
            )}
          </li>
        ))}
        {list.length === 0 && <li className="bg-paper px-4 py-10 text-center text-muted">Sin gastos este mes.</li>}
      </ul>
    </section>
  );
}
