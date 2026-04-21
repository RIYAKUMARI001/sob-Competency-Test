/**
 * src/core/types.ts
 *
 * Canonical types for the Shopstr MCP server — ported and trimmed
 * from utils/types/types.ts and utils/STATIC-VARIABLES.ts in the
 * main Shopstr app. No framework dependencies.
 */

// ─── Nostr primitives ────────────────────────────────────────────────────────

export type NostrTag = string[];

export interface NostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: NostrTag[];
  content: string;
  sig: string;
}

// ─── Shipping ─────────────────────────────────────────────────────────────────

export type ShippingOptionsType =
  | "N/A"
  | "Free"
  | "Pickup"
  | "Free/Pickup"
  | "Added Cost";

export const SHIPPING_OPTIONS: ShippingOptionsType[] = [
  "N/A",
  "Free",
  "Pickup",
  "Free/Pickup",
  "Added Cost",
];

// ─── Product ──────────────────────────────────────────────────────────────────

export interface ProductData {
  id: string;
  pubkey: string;
  createdAt: number;
  title: string;
  summary: string;
  publishedAt: string;
  images: string[];
  categories: string[];
  location: string;
  price: number;
  currency: string;
  shippingType?: ShippingOptionsType;
  shippingCost?: number;
  totalCost: number;
  d?: string;
  contentWarning?: boolean;
  quantity?: number;
  sizes?: string[];
  sizeQuantities?: Record<string, number>;
  volumes?: string[];
  volumePrices?: Record<string, number>;
  weights?: string[];
  weightPrices?: Record<string, number>;
  condition?: string;
  status?: string;
  required?: string;
  restrictions?: string;
  pickupLocations?: string[];
  expiration?: number;
  bulkPrices?: Record<number, number>;
}

// ─── Profile ──────────────────────────────────────────────────────────────────

export interface ProfileData {
  pubkey: string;
  name?: string;
  picture?: string;
  about?: string;
  banner?: string;
  lud16?: string;
  nip05?: string;
  website?: string;
  createdAt: number;
}

// ─── Shop profile (kind:30019) ────────────────────────────────────────────────

export interface ShopProfileData {
  pubkey: string;
  name: string;
  about: string;
  picture: string;
  banner: string;
  merchants: string[];
  freeShippingThreshold?: number;
  freeShippingCurrency?: string;
  createdAt: number;
}

// ─── Review ───────────────────────────────────────────────────────────────────

export interface ReviewData {
  reviewerPubkey: string;
  merchantPubkey: string;
  productDTag?: string;
  score: number;           // 0–5
  content: string;
  createdAt: number;
  eventId: string;
}
