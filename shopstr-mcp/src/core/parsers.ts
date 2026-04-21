/**
 * src/core/parsers.ts
 *
 * Pure parsing functions — no I/O, no framework deps.
 *
 * Ported from:
 *   utils/parsers/product-parser-functions.ts
 *   utils/parsers/review-parser-functions.ts   (score extraction)
 *   utils/nostr/fetch-service.ts               (profile parsing)
 */

import type { NostrEvent } from "./nostr-manager.js";
import type {
  ProductData,
  ProfileData,
  ShopProfileData,
  ReviewData,
  ShippingOptionsType,
} from "./types.js";
import { SHIPPING_OPTIONS } from "./types.js";

// ─── Shipping tag helper ──────────────────────────────────────────────────────

function parseShippingTag(tag: string[]): {
  shippingType: ShippingOptionsType;
  shippingCost: number;
} | null {
  const [, typeOrCost, maybeCost] = tag;
  if (!typeOrCost) return null;
  const shippingType =
    (SHIPPING_OPTIONS.find((t) => t === typeOrCost) as ShippingOptionsType | undefined) ??
    "N/A";
  const shippingCost = maybeCost
    ? parseFloat(maybeCost)
    : parseFloat(typeOrCost) || 0;
  return { shippingType, shippingCost };
}

// ─── Product parser ───────────────────────────────────────────────────────────

/**
 * Parse a raw kind:30402 Nostr event into a ProductData object.
 * Returns undefined if the event has no tags.
 *
 * Ported verbatim from utils/parsers/product-parser-functions.ts → parseTags()
 * with Maps replaced by plain Records for JSON-serialisability.
 */
export function parseTags(event: NostrEvent): ProductData | undefined {
  if (!event.tags) return undefined;

  const p: ProductData = {
    id: event.id,
    pubkey: event.pubkey,
    createdAt: event.created_at,
    title: "",
    summary: "",
    publishedAt: "",
    images: [],
    categories: [],
    location: "",
    price: 0,
    currency: "",
    totalCost: 0,
  };

  for (const tag of event.tags) {
    const [key, ...values] = tag;
    switch (key) {
      case "title":        p.title = values[0] ?? ""; break;
      case "summary":      p.summary = values[0] ?? ""; break;
      case "published_at": p.publishedAt = values[0] ?? ""; break;
      case "image":        p.images.push(values[0] ?? ""); break;
      case "t":            p.categories.push(values[0] ?? ""); break;
      case "location":     p.location = values[0] ?? ""; break;
      case "d":            p.d = values[0]; break;
      case "status":       p.status = values[0]; break;
      case "condition":    p.condition = values[0]; break;
      case "required":     p.required = values[0]; break;
      case "restrictions": p.restrictions = values[0]; break;

      case "price": {
        const [amount, currency] = values;
        p.price = Number(amount ?? 0);
        p.currency = currency ?? "";
        break;
      }
      case "shipping": {
        const s = parseShippingTag(tag);
        if (s) { p.shippingType = s.shippingType; p.shippingCost = s.shippingCost; }
        break;
      }
      case "content-warning": p.contentWarning = true; break;
      case "L":
        if (values[0] === "content-warning") p.contentWarning = true; break;
      case "l":
        if (values[1] === "content-warning") p.contentWarning = true; break;

      case "quantity":
        p.quantity = Number(values[0]); break;

      case "size": {
        const [size, qty] = values;
        if (!p.sizes) { p.sizes = []; p.sizeQuantities = {}; }
        p.sizes.push(size ?? "");
        p.sizeQuantities![size ?? ""] = Number(qty ?? 0);
        break;
      }
      case "volume": {
        if (!p.volumes) { p.volumes = []; p.volumePrices = {}; }
        if (values[0]) {
          p.volumes.push(values[0]);
          if (values[1]) p.volumePrices![values[0]] = parseFloat(values[1]);
        }
        break;
      }
      case "weight": {
        if (!p.weights) { p.weights = []; p.weightPrices = {}; }
        if (values[0]) {
          p.weights.push(values[0]);
          if (values[1]) p.weightPrices![values[0]] = parseFloat(values[1]);
        }
        break;
      }
      case "bulk": {
        if (!p.bulkPrices) p.bulkPrices = {};
        if (values[0] && values[1])
          p.bulkPrices[parseInt(values[0])] = parseFloat(values[1]);
        break;
      }
      case "pickup_location": {
        if (!p.pickupLocations) p.pickupLocations = [];
        p.pickupLocations.push(values[0] ?? "");
        break;
      }
      case "valid_until":
        p.expiration = Number(values[0]); break;
    }
  }

  p.totalCost = p.price + (p.shippingCost ?? 0);
  return p;
}

// ─── Profile parser (kind:0) ──────────────────────────────────────────────────

/**
 * Parse a raw kind:0 (metadata) Nostr event into a ProfileData object.
 * The event content is a JSON string of profile fields.
 */
export function parseProfile(event: NostrEvent): ProfileData | undefined {
  try {
    const content = JSON.parse(event.content) as Record<string, unknown>;
    return {
      pubkey: event.pubkey,
      createdAt: event.created_at,
      name:    typeof content["name"]    === "string" ? content["name"]    : undefined,
      picture: typeof content["picture"] === "string" ? content["picture"] : undefined,
      about:   typeof content["about"]   === "string" ? content["about"]   : undefined,
      banner:  typeof content["banner"]  === "string" ? content["banner"]  : undefined,
      lud16:   typeof content["lud16"]   === "string" ? content["lud16"]   : undefined,
      nip05:   typeof content["nip05"]   === "string" ? content["nip05"]   : undefined,
      website: typeof content["website"] === "string" ? content["website"] : undefined,
    };
  } catch {
    return undefined;
  }
}

// ─── Shop profile parser (kind:30019) ────────────────────────────────────────

/**
 * Parse a raw kind:30019 (shop profile) Nostr event into a ShopProfileData object.
 */
export function parseShopProfile(event: NostrEvent): ShopProfileData | undefined {
  try {
    const content = JSON.parse(event.content) as Record<string, unknown>;
    return {
      pubkey: event.pubkey,
      createdAt: event.created_at,
      name:    typeof content["name"]  === "string" ? content["name"]  : "",
      about:   typeof content["about"] === "string" ? content["about"] : "",
      picture: typeof content["ui"] === "object" && content["ui"] !== null
        ? String((content["ui"] as Record<string, unknown>)["picture"] ?? "")
        : "",
      banner: typeof content["ui"] === "object" && content["ui"] !== null
        ? String((content["ui"] as Record<string, unknown>)["banner"] ?? "")
        : "",
      merchants: Array.isArray(content["merchants"])
        ? (content["merchants"] as unknown[]).filter((m): m is string => typeof m === "string")
        : [],
      freeShippingThreshold:
        typeof content["freeShippingThreshold"] === "number"
          ? content["freeShippingThreshold"]
          : undefined,
      freeShippingCurrency:
        typeof content["freeShippingCurrency"] === "string"
          ? content["freeShippingCurrency"]
          : undefined,
    };
  } catch {
    return undefined;
  }
}

// ─── Review parser (kind:31925) ───────────────────────────────────────────────

/**
 * Parse a raw kind:31925 (NIP-99 review) Nostr event into a ReviewData object.
 *
 * Review events use tags:
 *   ["a", "30402:<merchant-pubkey>:<d-tag>"]   ← product address
 *   ["rating", "<0-5>"]                          ← numeric score
 */
export function parseReview(event: NostrEvent): ReviewData | undefined {
  let merchantPubkey = "";
  let productDTag: string | undefined;
  let score = 0;

  for (const tag of event.tags) {
    const [key, ...values] = tag;
    if (key === "a" && values[0]) {
      const parts = values[0].split(":");
      if (parts[0] === "30402" && parts[1] && parts[2]) {
        merchantPubkey = parts[1];
        productDTag = parts[2];
      }
    }
    if (key === "rating" && values[0]) {
      score = Math.min(5, Math.max(0, parseFloat(values[0]) || 0));
    }
  }

  if (!merchantPubkey) return undefined;

  return {
    reviewerPubkey: event.pubkey,
    merchantPubkey,
    productDTag,
    score,
    content: event.content,
    createdAt: event.created_at,
    eventId: event.id,
  };
}
