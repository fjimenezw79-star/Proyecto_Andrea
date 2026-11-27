import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";

export function Modal({ open, onOpenChange, title, children, wide = false }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; children: ReactNode; wide?: boolean }) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/45 data-[state=open]:animate-[fade_.2s_ease-out]" />
        <D.Content
          aria-describedby={undefined}
          className={`fixed inset-x-0 bottom-0 z-50 max-h-[92dvh] overflow-y-auto rounded-t-3xl bg-paper px-5 pb-[calc(env(safe-area-inset-bottom,0px)+20px)] pt-5 shadow-2xl md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-3xl md:px-8 md:pb-8 ${wide ? "md:w-[min(720px,calc(100vw-48px))]" : "md:w-[min(480px,calc(100vw-48px))]"}`}
        >
          <div className="mb-4 flex items-start justify-between gap-4">
            <D.Title className="font-serif text-4xl leading-none">{title}</D.Title>
            <D.Close className="grid size-11 shrink-0 place-items-center rounded-full bg-surface" aria-label="Cerrar">
              <X className="size-5" aria-hidden />
            </D.Close>
          </div>
          {children}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
