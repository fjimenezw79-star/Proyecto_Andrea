import { BarChart3, Boxes, History, CalendarClock, FolderTree, LayoutDashboard, PackagePlus, QrCode, Receipt, Settings, ShoppingBag, Users, Wallet, WalletCards, type LucideIcon } from "lucide-react";

export type NavItem = { to: string; label: string; short?: string; icon: LucideIcon; admin?: boolean; keywords?: string };

const ALL: NavItem[] = [
  { to: "/vender", label: "Vender", icon: ShoppingBag, keywords: "punto de venta cobrar" },
  { to: "/apartados", label: "Apartados", icon: CalendarClock, keywords: "abonos liquidar anticipo" },
  { to: "/caja", label: "Caja", icon: Wallet, keywords: "corte efectivo fondo turno" },
  { to: "/clientes", label: "Clientes", icon: Users, keywords: "puntos saldo a favor teléfono" },
  { to: "/inventario", label: "Inventario", icon: Boxes, keywords: "existencias stock productos" },
  { to: "/ventas", label: "Ventas de hoy", short: "Ventas", icon: Receipt, keywords: "tickets devoluciones cancelar" },
  { to: "/panel", label: "Panel", icon: LayoutDashboard, admin: true, keywords: "inicio resumen alertas" },
  { to: "/reportes", label: "Reportes", icon: BarChart3, admin: true, keywords: "utilidad excel csv más vendidos" },
  { to: "/gastos", label: "Gastos", icon: WalletCards, admin: true, keywords: "renta luz sueldos" },
  { to: "/productos/nuevo", label: "Nuevo producto", icon: PackagePlus, admin: true, keywords: "alta agregar fotos" },
  { to: "/categorias", label: "Categorías", icon: FolderTree, admin: true, keywords: "departamentos" },
  { to: "/bitacora", label: "Bitácora", icon: History, admin: true, keywords: "historial quién hizo auditoría sin señal" },
  { to: "/conectar", label: "Conectar dispositivo", icon: QrCode, admin: true, keywords: "qr enlace celular tablet internet whatsapp" },
  { to: "/configuracion", label: "Configuración", icon: Settings, admin: true, keywords: "negocio whatsapp ticket" },
];

export function navItems(role: "admin" | "seller"): NavItem[] {
  return ALL.filter((i) => role === "admin" || !i.admin);
}

export function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
