/**
 * src/tools/list-listings.ts
 *
 * MCP Tool: list_listings
 * Fetches recent NIP-99 (kind:30402) listings from the relay network.
 */

import { z } from "zod";
import { NostrManager } from "../core/nostr-manager.js";
import { parseTags } from "../core/parsers.js";
import { resolveRelays } from "../config/relay-config.js";
import { logger } from "../utils/logger.js";

// ─── Input schema ─────────────────────────────────────────────────────────────

export const ListListingsInput = z.object({
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .describe("Max number of listings to return (1–100, default 20)"),
  relays: z
    .array(z.string())
    .optional()
    .describe("Optional relay URLs to query (must be in allowlist)"),
  since: z
    .number()
    .int()
    .optional()
    .describe("Unix timestamp — only return listings created after this time"),
  until: z
    .number()
    .int()
    .optional()
    .describe("Unix timestamp — only return listings created before this time"),
});

export type ListListingsInput = z.infer<typeof ListListingsInput>;

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function listListings(raw: unknown) {
  const input = ListListingsInput.parse(raw);
  const relays = resolveRelays(input.relays);
  const start = Date.now();

  const manager = new NostrManager(relays);
  try {
    const filter: Record<string, unknown> = {
      kinds: [30402],
      limit: input.limit,
    };
    if (input.since !== undefined) filter["since"] = input.since;
    if (input.until !== undefined) filter["until"] = input.until;

    const events = await manager.fetch([filter as Parameters<typeof manager.fetch>[0][0]]);
    const products = events.map(parseTags).filter(Boolean);

    logger.info({
      tool: "list_listings",
      relay_count: relays.length,
      relays,
      event_count: events.length,
      duration_ms: Date.now() - start,
    });

    return {
      count: products.length,
      listings: products,
    };
  } finally {
    manager.close();
  }
}

// ─── MCP tool definition ──────────────────────────────────────────────────────

export const listListingsTool = {
  name: "list_listings",
  description:
    "Fetch recent NIP-99 product listings from the Shopstr relay network. " +
    "Returns structured ProductData objects including price, images, shipping, and categories.",
  inputSchema: {
    type: "object" as const,
    properties: {
      limit: {
        type: "number",
        description: "Max number of listings to return (1–100, default 20)",
        minimum: 1,
        maximum: 100,
        default: 20,
      },
      relays: {
        type: "array",
        items: { type: "string" },
        description: "Optional allowlisted relay URLs to query",
      },
      since: {
        type: "number",
        description: "Unix timestamp — only return listings newer than this",
      },
      until: {
        type: "number",
        description: "Unix timestamp — only return listings older than this",
      },
    },
    required: [],
  },
};
