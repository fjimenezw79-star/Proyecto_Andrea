import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { LogOut, Menu, PanelLeftClose, PanelLeftOpen, Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, useLocation, useOutlet } from "react-router";
import { useAuth } from "../auth/AuthProvider";
import { CommandPalette } from "./CommandPalette";
import { navItems } from "./nav";

function readCollapsed() {
  try {
    return localStorage.getItem("ma-sidebar") === "1";
  } catch {
    return false;
  }
}

export function AppShell() {
  const { user, logout } = useAuth();
  const loc = useLocation();
  const outlet = useOutlet();
  const reduce = useReducedMotion();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [palette, setPalette] = useState(false);
  const [more, setMore] = useState(false);
  const items = navItems(user!.role);

  useEffect(() => {
    try {
      localStorage.setItem("ma-sidebar", collapsed ? "1" : "0");
    } catch {
      /* sin almacenamiento */
    }
  }, [collapsed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => setMore(false), [loc.pathname]);

  const link = (compact: boolean) =>
    ({ isActive }: { isActive: boolean }) =>
      `relative flex items-center gap-3 rounded-full px-3.5 py-2.5 font-semibold transition-colors ${
        isActive ? "text-paper" : "text-ink hover:bg-surface"
      } ${compact ? "justify-center px-0" : ""}`;

  return (
    <div className="flex min-h-full">
      {/* Menú lateral: tablet y PC */}
      <motion.aside
        animate={{ width: collapsed ? 84 : 264 }}
        transition={{ duration: reduce ? 0 : 0.32, ease: [0.2, 0.8, 0.2, 1] }}
        className="sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-line bg-paper px-3 py-5 md:flex"
      >
        <div className={`mb-8 flex items-center gap-3 px-2 ${collapsed ? "justify-center" : ""}`}>
          <img src="/logo_ma.webp" alt="" className="size-11 shrink-0 rounded-full bg-night object-cover" />
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate font-serif text-2xl leading-none">Modas Andrea</p>
              <p className="text-sm text-muted">Yuda</p>
            </div>
          )}
        </div>
        <nav aria-label="Principal" className="flex flex-1 flex-col gap-1">
          {items.map((i) => (
            <NavLink key={i.to} to={i.to} className={link(collapsed)} title={collapsed ? i.label : undefined}>
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span
                      layoutId="nav-pill"
                      className="absolute inset-0 -z-0 rounded-full bg-ink"
                      transition={{ type: "spring", stiffness: 420, damping: 34 }}
                    />
                  )}
                  <i.icon className="relative size-5 shrink-0" aria-hidden />
                  {collapsed ? <span className="sr-only">{i.label}</span> : <span className="relative truncate">{i.label}</span>}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <button
          onClick={() => setPalette(true)}
          className={`mb-2 flex items-center gap-3 rounded-full border border-line px-3.5 py-2.5 text-muted hover:bg-surface ${collapsed ? "justify-center" : ""}`}
        >
          <Search className="size-5" aria-hidden />
          {collapsed ? <span className="sr-only">Buscar</span> : (
            <>
              <span className="flex-1 text-left">Buscar</span>
              <kbd className="rounded-md border border-line px-1.5 text-xs">Ctrl K</kbd>
            </>
          )}
        </button>
        <div className={`flex items-center gap-2 border-t border-line pt-4 ${collapsed ? "flex-col" : ""}`}>
          {!collapsed && (
            <div className="min-w-0 flex-1 px-2">
              <p className="truncate font-semibold">{user!.full_name || user!.username}</p>
              <p className="text-sm text-muted">{user!.role === "admin" ? "Administrador" : "Vendedor"}</p>
            </div>
          )}
          <button onClick={() => logout()} className="grid size-10 place-items-center rounded-full hover:bg-surface" title="Salir">
            <LogOut className="size-5" aria-hidden />
            <span className="sr-only">Salir</span>
          </button>
          <button onClick={() => setCollapsed((c) => !c)} className="grid size-10 place-items-center rounded-full hover:bg-surface" title={collapsed ? "Expandir menú" : "Contraer menú"}>
            {collapsed ? <PanelLeftOpen className="size-5" aria-hidden /> : <PanelLeftClose className="size-5" aria-hidden />}
            <span className="sr-only">{collapsed ? "Expandir menú" : "Contraer menú"}</span>
          </button>
        </div>
      </motion.aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Encabezado del celular */}
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-paper/90 px-4 pb-3 pt-[calc(env(safe-area-inset-top,0px)+12px)] backdrop-blur md:hidden">
          <img src="/logo_ma.webp" alt="" className="size-9 rounded-full bg-night object-cover" />
          <p className="flex-1 font-serif text-2xl leading-none">Modas Andrea</p>
          <button onClick={() => setPalette(true)} className="grid size-11 place-items-center rounded-full hover:bg-surface">
            <Search className="size-5" aria-hidden />
            <span className="sr-only">Buscar</span>
          </button>
        </header>

        <main className="relative flex-1 pb-[calc(env(safe-area-inset-bottom,0px)+84px)] md:pb-0">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={loc.pathname}
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? undefined : { opacity: 0, y: -6 }}
              transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
              className="h-full"
            >
              {outlet}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Barra inferior: celular */}
      <nav
        aria-label="Principal"
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-paper/95 px-2 pb-[calc(env(safe-area-inset-bottom,0px)+6px)] pt-1.5 backdrop-blur md:hidden"
      >
        {items.slice(0, 3).map((i) => (
          <NavLink key={i.to} to={i.to} className="relative flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-1.5 text-xs font-semibold">
            {({ isActive }) => (
              <>
                {isActive && <motion.span layoutId="tab-pill" className="absolute inset-x-3 top-0 h-1 rounded-full bg-wine" />}
                <i.icon className={`size-6 ${isActive ? "text-ink" : "text-muted"}`} aria-hidden />
                <span className={isActive ? "text-ink" : "text-muted"}>{i.label.replace(" de hoy", "")}</span>
              </>
            )}
          </NavLink>
        ))}
        <button onClick={() => setMore(true)} className="flex flex-1 flex-col items-center gap-0.5 py-1.5 text-xs font-semibold text-muted">
          <Menu className="size-6" aria-hidden />
          Más
        </button>
      </nav>

      <AnimatePresence>
        {more && (
          <motion.div className="fixed inset-0 z-50 md:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <button aria-label="Cerrar" className="absolute inset-0 bg-black/40" onClick={() => setMore(false)} />
            <motion.div
              role="dialog"
              aria-label="Más opciones"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ duration: reduce ? 0 : 0.35, ease: [0.2, 0.8, 0.2, 1] }}
              className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-paper px-5 pb-[calc(env(safe-area-inset-bottom,0px)+20px)] pt-4"
            >
              <div className="mb-3 flex items-center justify-between">
                <p className="font-serif text-3xl">{user!.full_name || user!.username}</p>
                <button onClick={() => setMore(false)} className="grid size-11 place-items-center rounded-full bg-surface">
                  <X className="size-5" aria-hidden />
                  <span className="sr-only">Cerrar</span>
                </button>
              </div>
              <div className="grid gap-1">
                {items.slice(3).map((i) => (
                  <NavLink key={i.to} to={i.to} className="flex items-center gap-3 rounded-2xl px-3 py-3 text-lg font-semibold hover:bg-surface">
                    <i.icon className="size-5" aria-hidden /> {i.label}
                  </NavLink>
                ))}
                <button onClick={() => logout()} className="flex items-center gap-3 rounded-2xl px-3 py-3 text-left text-lg font-semibold hover:bg-surface">
                  <LogOut className="size-5" aria-hidden /> Salir
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <CommandPalette open={palette} onOpenChange={setPalette} />
    </div>
  );
}
