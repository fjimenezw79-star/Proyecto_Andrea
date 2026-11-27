import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../lib/api";
import { Button } from "../ui/Button";
import { Field } from "../ui/Input";
import { useToast } from "../ui/Toast";

type Settings = { business_name: string; business_subtitle: string; whatsapp: string; address: string; ticket_width_mm: number; label_size: string; low_stock_threshold: number };

export function SettingsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ["settings"], queryFn: () => api<{ settings: Settings }>("/api/settings") });
  const [form, setForm] = useState<Settings | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (q.data && !form) setForm(q.data.settings); }, [q.data, form]);
  if (!form) return <p className="p-8 text-muted">Cargando…</p>;
  const set = (k: keyof Settings, v: string | number) => setForm({ ...form, [k]: v });

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      await api("/api/settings", { method: "PUT", json: { ...form, ticket_width_mm: Number(form!.ticket_width_mm), low_stock_threshold: Number(form!.low_stock_threshold) } });
      toast("Configuración guardada.", "ok");
      qc.invalidateQueries({ queryKey: ["settings"] });
    } catch (err) {
      if (err instanceof ApiError && err.field) setErrors({ [err.field]: err.message });
      toast(err instanceof ApiError ? err.message : "No se pudo guardar.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto max-w-3xl px-4 pb-12 pt-6 md:px-8">
      <h1 className="font-serif text-5xl leading-none md:text-6xl">Configuración</h1>
      <form onSubmit={save} className="mt-8 grid gap-8" noValidate>
        <fieldset className="grid gap-4">
          <legend className="mb-2 font-serif text-3xl">Negocio</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombre del negocio" value={form.business_name} onChange={(e) => set("business_name", e.target.value)} error={errors.business_name} />
            <Field label="Subtítulo" value={form.business_subtitle} onChange={(e) => set("business_subtitle", e.target.value)} error={errors.business_subtitle} />
            <Field label="WhatsApp del negocio" inputMode="tel" value={form.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} error={errors.whatsapp} hint="Aquí llegarán los pedidos de la tienda en línea." />
            <Field label="Dirección" value={form.address} onChange={(e) => set("address", e.target.value)} error={errors.address} />
          </div>
        </fieldset>
        <fieldset className="grid gap-4">
          <legend className="mb-2 font-serif text-3xl">Tickets, etiquetas e inventario</legend>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="grid gap-1.5 text-sm font-semibold">
              Ancho del ticket
              <select value={form.ticket_width_mm} onChange={(e) => set("ticket_width_mm", Number(e.target.value))} className="min-h-11 rounded-xl border border-line bg-paper px-3 text-base font-normal">
                <option value={58}>58 mm</option>
                <option value={80}>80 mm</option>
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-semibold">
              Tamaño de etiqueta
              <select value={form.label_size} onChange={(e) => set("label_size", e.target.value)} className="min-h-11 rounded-xl border border-line bg-paper px-3 text-base font-normal">
                <option value="50x25">Térmica 50 × 25 mm</option>
                <option value="carta">Hoja carta</option>
              </select>
            </label>
            <Field label="Avisar stock bajo con" inputMode="numeric" value={String(form.low_stock_threshold)} onChange={(e) => set("low_stock_threshold", e.target.value.replace(/\D/g, ""))} error={errors.low_stock_threshold} hint="piezas o menos" />
          </div>
        </fieldset>
        <Button type="submit" size="lg" disabled={busy} className="justify-self-start">{busy ? "Guardando…" : "Guardar configuración"}</Button>
      </form>
    </section>
  );
}
