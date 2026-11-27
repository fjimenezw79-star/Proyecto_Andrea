import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState, type FormEvent } from "react";
import { api, ApiError } from "../lib/api";
import type { Category } from "../lib/types";
import { Button } from "../ui/Button";
import { Field } from "../ui/Input";
import { useToast } from "../ui/Toast";

function flatten(cats: Category[], depth = 0): (Category & { depth: number })[] {
  return cats.flatMap((c) => [{ ...c, depth }, ...flatten(c.children, depth + 1)]);
}

function Node({ c, onRename, onToggle }: { c: Category; onRename: (c: Category, name: string) => void; onToggle: (c: Category) => void }) {
  const reduce = useReducedMotion();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(c.name);
  return (
    <motion.li data-category={c.name} layout={!reduce} initial={reduce ? false : { opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} className="grid gap-1">
      <div className={`flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-surface ${c.active ? "" : "text-muted line-through"}`}>
        {editing ? (
          <form className="flex flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); onRename(c, name); setEditing(false); }}>
            <input aria-label={`Nuevo nombre de ${c.name}`} value={name} onChange={(e) => setName(e.target.value)} autoFocus className="min-h-10 flex-1 rounded-lg border border-line bg-paper px-3" />
            <Button size="sm" type="submit">Guardar</Button>
          </form>
        ) : (
          <>
            <span id={`cat-${c.id}`} className="flex-1 font-semibold">{c.name}</span>
            <button className="text-sm underline" onClick={() => setEditing(true)}>Renombrar</button>
            <button className="text-sm underline" onClick={() => onToggle(c)}>{c.active ? "Desactivar" : "Activar"}</button>
          </>
        )}
      </div>
      {c.children.length > 0 && (
        <ul aria-label={`Dentro de ${c.name}`} className="ml-5 border-l border-line pl-3">
          <AnimatePresence initial={false}>
            {c.children.map((k) => <Node key={k.id} c={k} onRename={onRename} onToggle={onToggle} />)}
          </AnimatePresence>
        </ul>
      )}
    </motion.li>
  );
}

export function CategoriesPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState("");
  const [parent, setParent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const cats = useQuery({ queryKey: ["categories"], queryFn: () => api<{ categories: Category[] }>("/api/categories") });
  const tree = cats.data?.categories ?? [];
  const refresh = () => qc.invalidateQueries({ queryKey: ["categories"] });

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Escribe el nombre de la categoría.");
    try {
      await api("/api/categories", { method: "POST", json: { name: name.trim(), parent_id: parent ? Number(parent) : null } });
      toast("Categoría creada. Ya aparece en el punto de venta.", "ok");
      setName("");
      setError(null);
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo crear.");
    }
  }
  async function patch(c: Category, body: Record<string, unknown>, ok: string) {
    try {
      await api(`/api/categories/${c.id}`, { method: "PATCH", json: body });
      toast(ok, "ok");
      refresh();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "No se pudo guardar.", "error");
    }
  }

  return (
    <section className="mx-auto max-w-3xl px-4 pb-12 pt-6 md:px-8">
      <h1 className="font-serif text-5xl leading-none md:text-6xl">Categorías</h1>
      <p className="mt-2 text-muted">Cada categoría aparece como filtro en el punto de venta y, más adelante, como sección de la tienda en línea.</p>
      <form onSubmit={add} className="mt-8 grid gap-3 rounded-3xl bg-surface p-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Field label="Nueva categoría" value={name} onChange={(e) => setName(e.target.value)} error={error} placeholder="Termos" />
        <label className="grid gap-1.5 text-sm font-semibold">
          Dentro de
          <select value={parent} onChange={(e) => setParent(e.target.value)} className="min-h-11 rounded-xl border border-line bg-paper px-3 text-base font-normal">
            <option value="">(Ninguna, es principal)</option>
            {flatten(tree).map((c) => <option key={c.id} value={c.id}>{c.depth ? `${"· ".repeat(c.depth)}${c.name}` : c.name}</option>)}
          </select>
        </label>
        <Button type="submit">Agregar</Button>
      </form>
      <ul aria-label="Categorías" className="mt-8 grid gap-1">
        <AnimatePresence initial={false}>
          {tree.map((c) => (
            <Node key={c.id} c={c} onRename={(x, n) => patch(x, { name: n }, "Nombre actualizado.")} onToggle={(x) => patch(x, { active: !x.active }, x.active ? "Categoría desactivada." : "Categoría activada.")} />
          ))}
        </AnimatePresence>
      </ul>
    </section>
  );
}
