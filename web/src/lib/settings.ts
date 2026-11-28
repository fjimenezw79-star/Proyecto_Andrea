import { useQuery } from "@tanstack/react-query";
import { loadSettingsCache, saveSettingsCache } from "../offline/cache";
import { api, ApiError } from "./api";

export type LabelSize = "50x25" | "carta-30" | "carta-20" | "carta-10";
export type BusinessSettings = {
  business_name: string;
  business_subtitle: string;
  whatsapp: string;
  address: string;
  ticket_width_mm: number;
  label_size: LabelSize;
  low_stock_threshold: number;
  ticket_footer: string;
  ai_monthly_limit: number;
  business_hours: string;
  store_tagline: string;
  store_intro: string;
  store_hide_sold_out: boolean;
};

export const DEFAULT_SETTINGS: BusinessSettings = {
  business_name: "Modas Andrea", business_subtitle: "Yuda", whatsapp: "", address: "", ticket_width_mm: 58,
  label_size: "50x25", low_stock_threshold: 2, ticket_footer: "¡Gracias por tu compra!", ai_monthly_limit: 100,
  business_hours: "", store_tagline: "", store_intro: "", store_hide_sold_out: false,
};

/** Configuración del negocio; sin señal usa la última copia guardada en el dispositivo. */
export async function fetchSettings(): Promise<BusinessSettings> {
  try {
    const d = await api<{ settings: BusinessSettings }>("/api/settings");
    await saveSettingsCache(d.settings);
    return { ...DEFAULT_SETTINGS, ...d.settings };
  } catch (e) {
    if (!(e instanceof ApiError) || e.status !== 0) throw e;
    return { ...DEFAULT_SETTINGS, ...((await loadSettingsCache<BusinessSettings>()) ?? {}) };
  }
}

export function useBusinessSettings() {
  return useQuery({ queryKey: ["settings"], queryFn: fetchSettings, staleTime: 5 * 60_000 });
}

export type StoreStatus = {
  local_url: string;
  public_url: string;
  cloud: { configured: boolean; url: string | null; publishing: boolean; last_publish: string | null; last_error: string | null; last_pull: string | null };
};

/** Dirección de la tienda en línea (la de Cloudflare si está configurada; si no, la de esta PC). */
export function useStoreStatus() {
  return useQuery({ queryKey: ["store-status"], queryFn: () => api<StoreStatus>("/api/store"), staleTime: 60_000, retry: false });
}
