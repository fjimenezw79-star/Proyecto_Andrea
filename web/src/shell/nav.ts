import { Boxes, FolderTree, PackagePlus, Receipt, Settings, ShoppingBag, type LucideIcon } from "lucide-react";

export type NavItem = { to: string; label: string; icon: LucideIcon; admin?: boolean; keywords?: string };

const ALL: NavItem[] = [
  { to: "/vender", label: "Vender", icon: ShoppingBag, keywords: "punto de venta cobrar caja" },
  { to: "/inventario", label: "Inventario", icon: Boxes, keywords: "existencias stock productos" },
  { to: "/ventas", label: "Ventas de hoy", icon: Receipt, keywords: "tickets corte cancelar" },
  { to: "/productos/nuevo", label: "Nuevo producto", icon: PackagePlus, admin: true, keywords: "alta agregar fotos" },
  { to: "/categorias", label: "Categorías", icon: FolderTree, admin: true, keywords: "departamentos" },
  { to: "/configuracion", label: "Configuración", icon: Settings, admin: true, keywords: "negocio whatsapp ticket" },
];

export function navItems(role: "admin" | "seller"): NavItem[] {
  return ALL.filter((i) => role === "admin" || !i.admin);
}

export function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
