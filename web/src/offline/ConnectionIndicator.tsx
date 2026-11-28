import { AnimatePresence, motion } from "motion/react";
import { CloudOff, CloudUpload } from "lucide-react";
import { useState } from "react";
import { useOffline } from "./OfflineProvider";
import { PendingSheet } from "./PendingSheet";

/** Píldora "Sin señal" y nube con los pendientes por enviar. */
export function ConnectionIndicator({ compact = false }: { compact?: boolean }) {
  const { online, pendingCount, problems } = useOffline();
  const [open, setOpen] = useState(false);
  const label = `${pendingCount} ${pendingCount === 1 ? "pendiente" : "pendientes"}`;
  return (
    <>
      <AnimatePresence initial={false}>
        {(!online || pendingCount > 0) && (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className={`flex items-center gap-1.5 ${compact ? "flex-col" : ""}`}>
            {!online && (
              <span role="status" className="inline-flex items-center gap-1.5 rounded-full bg-wine px-3 py-1.5 text-sm font-semibold text-wine-ink" title="Sin señal">
                <CloudOff className="size-4" aria-hidden />
                {compact ? <span className="sr-only">Sin señal</span> : "Sin señal"}
              </span>
            )}
            {pendingCount > 0 && (
              <button onClick={() => setOpen(true)} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold ${problems ? "border-danger text-danger" : "border-line"}`} title={label}>
                <CloudUpload className="size-4" aria-hidden />
                {compact ? <span className="sr-only">{label}</span> : label}
                {compact && <span aria-hidden>{pendingCount}</span>}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      <PendingSheet open={open} onOpenChange={setOpen} />
    </>
  );
}
