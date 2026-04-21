/**
 * src/tools/search-listings.ts
 *
 * MCP Tool: search_listings
 * Filter NIP-99 listings by category tag, currency, price range, or seller pubkey.
 */

import { z } from "zod";
import { NostrManager } from "../core/nostr-manager.js";
import { parseTags } from "../core/parsers.js";
import { resolveRelays } from "../config/relay-config.js";
import { logger } from "../utils/logger.js";

// ─── Input schema ─────────────────────────────────────────────────────────────

export const SearchListingsInput = z.object({
  category: z
    .string()
    .optional()
    .describe('Category tag to filter by, e.g. "Physical", "Digital", "Clothing"'),
  currency: z
    .string()
    .optional()
    .describe('Currency filter, e.g. "BTC", "SATS", "USD"'),
  seller_pubkey: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .optional()
    .describe("Filter to listings from a specific seller (hex pubkey)"),
  min_price: z
    .number()
    .min(0)
    .optional()
    .describe("Minimum price (inclusive, in listing currency)"),
  max_price: z
    .number()
    .min(0)
    .optional()
    .describe("Maximum price (inclusive, in listing currency)"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .describe("Max results to return (1–100)"),
  relays: z
    .array(z.string())
    .optional()
    .describe("Optional allowlisted relay URLs"),
});

export type SearchListingsInput = z.infer<typeof SearchListingsInput>;

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function searchListings(raw: unknown) {
  const input = SearchListingsInput.parse(raw);
  const relays = resolveRelays(input.relays);
  const start = Date.now();

  // Build the Nostr filter — use relay-level tag filtering where possible
  const filter: Record<string, unknown> = {
    kinds: [30402],
    limit: 200, // fetch more than needed, then client-filter
  };
  if (input.category)      filter["#t"] = [input.category];
  if (input.seller_pubkey) filter["authors"] = [input.seller_pubkey];

  const manager = new NostrManager(relays);
  try {
    const events = await manager.fetch([filter as Parameters<typeof manager.fetch>[0][0]]);
    let products = events.map(parseTags).filter(Boolean);

    // Client-side filters (not expressible in Nostr protocol filters)
    if (input.currency) {
      const curr = input.currency.toUpperCase();
      products = products.filter((p) => p!.currency?.toUpperCase() === curr);
    }
    if (input.min_price !== undefined) {
      products = products.filter((p) => p!.price >= input.min_price!);
    }
    if (input.max_price !== undefined) {
      products = products.filter((p) => p!.price <= input.max_price!);
    }

    // Apply requested limit after client-side filtering
    const sliced = products.slice(0, input.limit);

    logger.info({
      tool: "search_listings",
      relay_count: relays.length,
      relays,
      event_count: events.length,
      duration_ms: Date.now() - start,
    });

    return {
      count: sliced.length,
      filters_applied: {
        category: input.category,
        currency: input.currency,
        seller_pubkey: input.seller_pubkey,
        min_price: input.min_price,
        max_price: input.max_price,
      },
      listings: sliced,
    };
  } finally {
    manager.close();
  }
}

// ─── MCP tool definition ──────────────────────────────────────────────────────

export const searchListingsTool = {
  name: "search_listings",
  description:
    "Search and filter Shopstr NIP-99 listings by category, currency, price range, " +
    "or seller. Returns matching ProductData objects.",
  inputSchema: {
    type: "object" as const,
    properties: {
      category: {
        type: "string",
        description: 'Category tag, e.g. "Physical", "Digital", "Clothing", "Books"',
      },
      currency: {
        type: "string",
        description: 'Currency code, e.g. "BTC", "SATS"',
      },
      seller_pubkey: {
        type: "string",
        description: "Filter to one seller — 64-char hex pubkey",
        pattern: "^[0-9a-f]{64}$",
      },
      min_price: {
        type: "number",
        description: "Minimum price (in listing's currency)",
        minimum: 0,
      },
      max_price: {
        type: "number",
        description: "Maximum price (in listing's currency)",
        minimum: 0,
      },
      limit: {
        type: "number",
        description: "Max results (1–100, default 20)",
        minimum: 1,
        maximum: 100,
        default: 20,
      },
      relays: {
        type: "array",
        items: { type: "string" },
        description: "Optional allowlisted relay URLs",
      },
    },
    required: [],
  },
};
