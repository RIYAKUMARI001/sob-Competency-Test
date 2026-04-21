/**
 * shopstr-mcp-demo / fetch-listings.ts
 *
 * Competency Task Part 1:
 *   Extract parseTags() and a minimal NostrManager into a standalone
 *   Node.js script that fetches and prints ProductData objects from a
 *   public Nostr relay.
 *
 * Run:  npx tsx fetch-listings.ts
 */

import "websocket-polyfill";                        // Node.js WebSocket shim
import { SimplePool, verifyEvent } from "nostr-tools";
import type { Filter, Event } from "nostr-tools";

/** Pass --mock to use offline sample data instead of live relays */
const USE_MOCK = process.argv.includes("--mock");

// ─── Constants ────────────────────────────────────────────────────────────────

/** Public relays known to carry Shopstr NIP-99 (kind:30402) events */
const PUBLIC_RELAYS = [
  "wss://nos.lol",
  "wss://relay.nostr.band",
  "wss://nostr.wine",
];

/** NIP-99 event kind */
const KIND_CLASSIFIED_LISTING = 30402;

/** How many listings to display (keep output manageable) */
const LIMIT = 10;

/** Max ms to wait for EOSE before giving up */
const FETCH_TIMEOUT_MS = 15_000;

// ─── Types (inlined from utils/types/types.ts & utils/STATIC-VARIABLES.ts) ───

type ShippingOptionsType = "N/A" | "Free" | "Pickup" | "Free/Pickup" | "Added Cost";

export type ProductData = {
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
  sizeQuantities?: Map<string, number>;
  volumes?: string[];
  volumePrices?: Map<string, number>;
  weights?: string[];
  weightPrices?: Map<string, number>;
  condition?: string;
  status?: string;
  required?: string;
  restrictions?: string;
  pickupLocations?: string[];
  expiration?: number;
  bulkPrices?: Map<number, number>;
  rawEvent?: Event;
};

// ─── Shipping tag helper (inlined from utils/parsers/product-tag-helpers.ts) ─

function parseShippingTag(tag: string[]): {
  shippingType: ShippingOptionsType;
  shippingCost: number;
} | null {
  const [, typeOrCost, maybeCost] = tag;
  if (!typeOrCost) return null;

  // Format: ["shipping", "<type>", "<cost?>"]  OR  ["shipping", "<cost>"]
  const knownTypes: ShippingOptionsType[] = ["N/A", "Free", "Pickup", "Free/Pickup", "Added Cost"];
  const shippingType = knownTypes.find((t) => t === typeOrCost) ?? "N/A";
  const shippingCost = maybeCost ? parseFloat(maybeCost) : parseFloat(typeOrCost) || 0;
  return { shippingType, shippingCost };
}

// ─── parseTags (ported from utils/parsers/product-parser-functions.ts) ────────

/**
 * Parse a raw Nostr kind:30402 event into a structured ProductData object.
 * This is the canonical Shopstr NIP-99 tag parser, extracted into a
 * dependency-free form suitable for any Node.js environment.
 */
export function parseTags(productEvent: Event): ProductData | undefined {
  const parsedData: ProductData = {
    id: productEvent.id,
    pubkey: productEvent.pubkey,
    createdAt: productEvent.created_at,
    title: "",
    summary: "",
    publishedAt: "",
    images: [],
    categories: [],
    location: "",
    price: 0,
    currency: "",
    totalCost: 0,
    rawEvent: productEvent,
  };

  const tags = productEvent.tags;
  if (!tags) return undefined;

  tags.forEach((tag) => {
    const [key, ...values] = tag;
    switch (key) {
      case "title":
        parsedData.title = values[0] ?? "";
        break;
      case "summary":
        parsedData.summary = values[0] ?? "";
        break;
      case "published_at":
        parsedData.publishedAt = values[0] ?? "";
        break;
      case "image":
        parsedData.images.push(values[0] ?? "");
        break;
      case "t":
        parsedData.categories.push(values[0] ?? "");
        break;
      case "location":
        parsedData.location = values[0] ?? "";
        break;
      case "price": {
        const [amount, currency] = values;
        parsedData.price = Number(amount ?? 0);
        parsedData.currency = currency ?? "";
        break;
      }
      case "shipping": {
        const parsed = parseShippingTag(tag);
        if (parsed) {
          parsedData.shippingType = parsed.shippingType;
          parsedData.shippingCost = parsed.shippingCost;
        }
        break;
      }
      case "d":
        parsedData.d = values[0];
        break;
      case "content-warning":
        parsedData.contentWarning = true;
        break;
      case "L":
        if (values[0] === "content-warning") parsedData.contentWarning = true;
        break;
      case "l":
        if (values[1] === "content-warning") parsedData.contentWarning = true;
        break;
      case "quantity":
        parsedData.quantity = Number(values[0]);
        break;
      case "size": {
        const [size, qty] = values;
        if (!parsedData.sizes) parsedData.sizes = [];
        if (!parsedData.sizeQuantities) parsedData.sizeQuantities = new Map();
        parsedData.sizes.push(size ?? "");
        parsedData.sizeQuantities.set(size ?? "", Number(qty ?? 0));
        break;
      }
      case "volume": {
        if (!parsedData.volumes) { parsedData.volumes = []; parsedData.volumePrices = new Map(); }
        if (values[0]) {
          parsedData.volumes.push(values[0]);
          if (values[1]) parsedData.volumePrices!.set(values[0], parseFloat(values[1]));
        }
        break;
      }
      case "weight": {
        if (!parsedData.weights) { parsedData.weights = []; parsedData.weightPrices = new Map(); }
        if (values[0]) {
          parsedData.weights.push(values[0]);
          if (values[1]) parsedData.weightPrices!.set(values[0], parseFloat(values[1]));
        }
        break;
      }
      case "bulk": {
        if (!parsedData.bulkPrices) parsedData.bulkPrices = new Map();
        if (values[0] && values[1]) parsedData.bulkPrices.set(parseInt(values[0]), parseFloat(values[1]));
        break;
      }
      case "condition":
        parsedData.condition = values[0];
        break;
      case "status":
        parsedData.status = values[0];
        break;
      case "required":
        parsedData.required = values[0];
        break;
      case "restrictions":
        parsedData.restrictions = values[0];
        break;
      case "pickup_location":
        if (!parsedData.pickupLocations) parsedData.pickupLocations = [];
        parsedData.pickupLocations.push(values[0] ?? "");
        break;
      case "valid_until":
        parsedData.expiration = Number(values[0]);
        break;
      default:
        break;
    }
  });

  // Simple totalCost: price + shippingCost (mirrors calculateTotalCost logic)
  parsedData.totalCost =
    parsedData.price + (parsedData.shippingCost ?? 0);

  return parsedData;
}

// ─── Minimal NostrManager (ported from utils/nostr/nostr-manager.ts) ──────────

/**
 * A stripped-down, read-only version of Shopstr's NostrManager.
 * Wraps nostr-tools SimplePool for fetch-and-close queries.
 */
class NostrManager {
  private pool: SimplePool;
  private relayUrls: string[];

  constructor(relays: string[]) {
    this.pool = new SimplePool();
    this.relayUrls = relays;
  }

  /**
   * Fetch all events matching `filters` from the configured relays.
   * Closes the subscription after EOSE or timeout.
   */
  fetch(filters: Filter[], timeoutMs = FETCH_TIMEOUT_MS): Promise<Event[]> {
    return new Promise((resolve, reject) => {
      const events: Event[] = [];
      const timer = setTimeout(() => {
        this.pool.close(this.relayUrls);
        console.warn(`[NostrManager] fetch timed out after ${timeoutMs}ms — returning ${events.length} events`);
        resolve(events);
      }, timeoutMs);

      const sub = this.pool.subscribeMany(this.relayUrls, filters, {
        onevent: (event: Event) => {
          if (verifyEvent(event)) {
            events.push(event);
          }
        },
        oneose: () => {
          clearTimeout(timer);
          sub.close();
          resolve(events);
        },
      });
    });
  }

  close() {
    this.pool.close(this.relayUrls);
  }
}

// ─── Field presence tracker ───────────────────────────────────────────────────

type FieldStats = {
  present: number;
  absent: number;
};

function trackFields(products: ProductData[]): Record<string, FieldStats> {
  const optionalFields: (keyof ProductData)[] = [
    "summary", "images", "categories", "location",
    "currency", "shippingType", "shippingCost",
    "publishedAt", "d", "contentWarning",
    "quantity", "sizes", "volumes", "weights",
    "condition", "status", "required", "restrictions",
    "pickupLocations", "expiration", "bulkPrices",
  ];

  const stats: Record<string, FieldStats> = {};
  for (const field of optionalFields) {
    stats[field] = { present: 0, absent: 0 };
  }

  for (const p of products) {
    for (const field of optionalFields) {
      const val = p[field];
      const populated =
        val !== undefined &&
        val !== "" &&
        val !== 0 &&
        !(Array.isArray(val) && val.length === 0);
      if (populated) stats[field].present++;
      else stats[field].absent++;
    }
  }

  return stats;
}

// ─── Pretty printer ───────────────────────────────────────────────────────────

function printProduct(p: ProductData, index: number) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`  Listing #${index + 1}`);
  console.log(`${"─".repeat(60)}`);
  console.log(`  ID          : ${p.id}`);
  console.log(`  Pubkey      : ${p.pubkey}`);
  console.log(`  Created At  : ${new Date(p.createdAt * 1000).toISOString()}`);
  console.log(`  Title       : ${p.title || "(empty)"}`);
  console.log(`  Summary     : ${p.summary ? p.summary.slice(0, 80) + "…" : "(empty)"}`);
  console.log(`  Price       : ${p.price} ${p.currency}`);
  console.log(`  Total Cost  : ${p.totalCost} ${p.currency}`);
  console.log(`  Location    : ${p.location || "(not set)"}`);
  console.log(`  Categories  : ${p.categories.join(", ") || "(none)"}`);
  console.log(`  Images      : ${p.images.length} image(s)`);
  console.log(`  Shipping    : ${p.shippingType ?? "(not set)"} — cost: ${p.shippingCost ?? "n/a"}`);
  console.log(`  Status      : ${p.status ?? "(not set)"}`);
  console.log(`  Condition   : ${p.condition ?? "(not set)"}`);
  console.log(`  Quantity    : ${p.quantity ?? "(not set)"}`);
  console.log(`  Sizes       : ${p.sizes?.join(", ") ?? "(not set)"}`);
  console.log(`  Expiration  : ${p.expiration ? new Date(p.expiration * 1000).toISOString() : "(not set)"}`);
}

function printFieldReport(stats: Record<string, FieldStats>, total: number) {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  ProductData Field Presence Report (${total} listings sampled)`);
  console.log(`${"═".repeat(60)}`);
  console.log(`  ${"Field".padEnd(22)} ${"Present".padStart(8)}  ${"Absent".padStart(8)}  ${"Fill %".padStart(7)}`);
  console.log(`  ${"-".repeat(52)}`);
  for (const [field, { present, absent }] of Object.entries(stats)) {
    const pct = total === 0 ? 0 : Math.round((present / total) * 100);
    const marker = pct >= 70 ? "✓" : pct >= 30 ? "~" : "✗";
    console.log(
      `  ${marker} ${field.padEnd(21)} ${String(present).padStart(8)}  ${String(absent).padStart(8)}  ${String(pct + "%").padStart(7)}`
    );
  }
  console.log(`\n  Legend: ✓ consistently populated (≥70%)  ~ sometimes (~30–69%)  ✗ rarely (<30%)\n`);
}

// ─── Mock data (offline fallback — run with --mock) ──────────────────────────

/**
 * Realistic sample NIP-99 events generated from actual Shopstr listing shapes.
 * Used when --mock is passed or when relays cannot be reached.
 */
const MOCK_EVENTS: Event[] = [
  {
    id: "aaaa0001bbbb0002cccc0003dddd0004eeee0005ffff0006aaaa0007bbbb0008",
    pubkey: "1111222233334444555566667777888899990000aaaabbbbccccddddeeee1111",
    created_at: Math.floor(Date.now() / 1000) - 86400,
    kind: 30402,
    tags: [
      ["d", "vintage-leather-wallet"],
      ["title", "Handcrafted Vintage Leather Wallet"],
      ["summary", "Full-grain vegetable-tanned leather wallet. Made to order. Ships in 3–5 days."],
      ["image", "https://images.unsplash.com/photo-1627123424574-724758594785?w=600"],
      ["price", "0.00015", "BTC"],
      ["t", "Accessories"],
      ["t", "Physical"],
      ["location", "Brooklyn, NY, USA"],
      ["shipping", "Added Cost", "0.00002"],
      ["condition", "New"],
      ["status", "active"],
      ["quantity", "12"],
      ["published_at", String(Math.floor(Date.now() / 1000) - 86400)],
    ],
    content: "Full-grain vegetable-tanned leather wallet. Made to order. Ships in 3–5 days.",
    sig: "a".repeat(128),
  },
  {
    id: "bbbb0001cccc0002dddd0003eeee0004ffff0005aaaa0006bbbb0007cccc0008",
    pubkey: "2222333344445555666677778888999900001111aaaabbbbccccddddeeeeffff",
    created_at: Math.floor(Date.now() / 1000) - 3600,
    kind: 30402,
    tags: [
      ["d", "nostr-developer-course"],
      ["title", "Nostr Protocol Developer Course — 4 Weeks"],
      ["summary", "Learn to build Nostr clients, relays, and integrations from scratch. Live cohort."],
      ["image", "https://images.unsplash.com/photo-1593642632559-0c6d3fc62b89?w=600"],
      ["price", "0.005", "BTC"],
      ["t", "Services"],
      ["t", "Digital"],
      ["shipping", "N/A"],
      ["status", "active"],
      ["published_at", String(Math.floor(Date.now() / 1000) - 3600)],
    ],
    content: "Learn to build Nostr clients, relays, and integrations from scratch. Live cohort.",
    sig: "b".repeat(128),
  },
  {
    id: "cccc0001dddd0002eeee0003ffff0004aaaa0005bbbb0006cccc0007dddd0008",
    pubkey: "3333444455556666777788889999000011112222aaaabbbbccccddddeeeeffff",
    created_at: Math.floor(Date.now() / 1000) - 7200,
    kind: 30402,
    tags: [
      ["d", "custom-tshirt-sizes"],
      ["title", "Bitcoin Lightning ⚡ T-Shirt — Multiple Sizes"],
      ["summary", "100% organic cotton tee with Lightning Network graphic. Available in S, M, L, XL."],
      ["image", "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=600"],
      ["price", "0.00008", "BTC"],
      ["t", "Clothing"],
      ["t", "Physical"],
      ["location", "Austin, TX, USA"],
      ["shipping", "Free"],
      ["size", "S", "5"],
      ["size", "M", "10"],
      ["size", "L", "8"],
      ["size", "XL", "3"],
      ["condition", "New"],
      ["status", "active"],
      ["published_at", String(Math.floor(Date.now() / 1000) - 7200)],
    ],
    content: "100% organic cotton tee with Lightning Network graphic. Available in S, M, L, XL.",
    sig: "c".repeat(128),
  },
  {
    id: "dddd0001eeee0002ffff0003aaaa0004bbbb0005cccc0006dddd0007eeee0008",
    pubkey: "4444555566667777888899990000111122223333aaaabbbbccccddddeeeeffff",
    created_at: Math.floor(Date.now() / 1000) - 172800,
    kind: 30402,
    tags: [
      ["d", "bitcoin-book-mastering"],
      ["title", "Mastering Bitcoin — 3rd Edition (Signed Copy)"],
      ["summary", "Signed physical copy of Andreas Antonopoulos's Mastering Bitcoin."],
      ["image", "https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=600"],
      ["price", "0.00025", "BTC"],
      ["t", "Books"],
      ["t", "Physical"],
      ["location", "London, UK"],
      ["shipping", "Added Cost", "0.00003"],
      ["condition", "New"],
      ["status", "active"],
      ["quantity", "2"],
      ["published_at", String(Math.floor(Date.now() / 1000) - 172800)],
      ["valid_until", String(Math.floor(Date.now() / 1000) + 2592000)],
    ],
    content: "Signed physical copy of Andreas Antonopoulos's Mastering Bitcoin.",
    sig: "d".repeat(128),
  },
  {
    id: "eeee0001ffff0002aaaa0003bbbb0004cccc0005dddd0006eeee0007ffff0008",
    pubkey: "5555666677778888999900001111222233334444aaaabbbbccccddddeeeeffff",
    created_at: Math.floor(Date.now() / 1000) - 43200,
    kind: 30402,
    tags: [
      ["d", "handmade-hot-sauce"],
      ["title", "Small-Batch Ghost Pepper Hot Sauce — Volume Pricing"],
      ["summary", "Handmade ghost pepper sauce. Accepts Lightning payments only."],
      ["image", "https://images.unsplash.com/photo-1589302168068-964664d93dc0?w=600"],
      ["price", "0.00004", "BTC"],
      ["t", "Food"],
      ["t", "Physical"],
      ["location", "Portland, OR, USA"],
      ["shipping", "Free/Pickup"],
      ["pickup_location", "Portland Saturday Market — Booth #12"],
      ["volume", "150ml", "0.00004"],
      ["volume", "300ml", "0.00007"],
      ["volume", "500ml", "0.0001"],
      ["condition", "New"],
      ["status", "active"],
      ["published_at", String(Math.floor(Date.now() / 1000) - 43200)],
    ],
    content: "Handmade ghost pepper sauce. Accepts Lightning payments only.",
    sig: "e".repeat(128),
  },
];

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║   Shopstr NIP-99 Live Relay Demo — Competency Task       ║");
  console.log("╚══════════════════════════════════════════════════════════╝");

  let rawEvents: Event[] = [];

  if (USE_MOCK) {
    console.log("\n[MODE] OFFLINE MOCK — using sample NIP-99 events (no relay connection)\n");
    rawEvents = MOCK_EVENTS;
  } else {
    console.log(`\nRelays  : ${PUBLIC_RELAYS.join(", ")}`);
    console.log(`Filter  : kind=${KIND_CLASSIFIED_LISTING}, limit=${LIMIT}`);
    console.log(`Timeout : ${FETCH_TIMEOUT_MS / 1000}s\n`);

    const manager = new NostrManager(PUBLIC_RELAYS);
    const filter: Filter = {
      kinds: [KIND_CLASSIFIED_LISTING],
      limit: LIMIT,
    };

    console.log("Connecting to relays and fetching listings…");
    try {
      rawEvents = await manager.fetch([filter]);
    } catch (err) {
      console.error("Fetch error:", err);
      manager.close();
      process.exit(1);
    }
    manager.close();
    console.log(`\nReceived ${rawEvents.length} raw event(s) from relays.`);

    if (rawEvents.length === 0) {
      console.log("\n⚠  No events returned from relays (possible network restriction).");
      console.log("   Re-run with --mock flag to see a demo with sample data:\n");
      console.log("     npx tsx fetch-listings.ts --mock\n");
      process.exit(0);
    }
  }

  // Parse each event with parseTags()
  const products: ProductData[] = rawEvents
    .map((e) => parseTags(e))
    .filter((p): p is ProductData => p !== undefined);

  console.log(`Successfully parsed ${products.length} ProductData object(s).`);

  // Print each listing
  products.forEach((p, i) => printProduct(p, i));

  // Field presence report
  const stats = trackFields(products);
  printFieldReport(stats, products.length);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
