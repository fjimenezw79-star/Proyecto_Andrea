export type Photo = { id: number; url: string; thumb_url: string };
export type Variant = {
  id: number;
  sku: string;
  barcode: string | null;
  attrs: Record<string, string>;
  price_cents: number;
  cost_cents?: number;
  stock: number;
  hidden: boolean;
  active: boolean;
};
export type Product = {
  id: number;
  name: string;
  slug?: string;
  description: string;
  category_id: number;
  category: string;
  online: boolean;
  active: boolean;
  photos: Photo[];
  variants: Variant[];
  stock_total: number;
};
export type Category = { id: number; name: string; slug: string; parent_id: number | null; sort: number; active: boolean; children: Category[] };
