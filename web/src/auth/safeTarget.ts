/** Solo rutas internas de la app; cualquier otra cosa manda a Vender. */
export function safeTarget(back: string | null): string {
  if (!back || !back.startsWith("/") || back.startsWith("//") || back.includes("\\")) return "/vender";
  try {
    const u = new URL(back, window.location.origin);
    return u.origin === window.location.origin ? u.pathname + u.search : "/vender";
  } catch {
    return "/vender";
  }
}
