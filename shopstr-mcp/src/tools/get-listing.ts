/**
 * src/tools/get-listing.ts
 *
 * MCP Tool: get_listing
 * Fetch a single NIP-99 listing by seller pubkey + d-tag identifier.
 */

import { z } from "zod";
import { NostrManager } from "../core/nostr-manager.js";
import { parseTags } from "../core/parsers.js";
import { resolveRelays } from "../config/relay-config.js";
import { logger } from "../utils/logger.js";

// ─── Input schema ─────────────────────────────────────────────────────────────

export const GetListingInput = z.object({
  pubkey: z
    .string()
    .regex(/^[0-9a-f]{64}$/, "pubkey must be a 64-character lowercase hex string")
    .describe("Seller's Nostr public key (hex)"),
  d_tag: z
    .string()
    .min(1)
    .describe("The listing's unique d-tag identifier (NIP-33 slug)"),
  relays: z
    .array(z.string())
    .optional()
    .describe("Optional relay URLs to query (must be in allowlist)"),
});

export type GetListingInput = z.infer<typeof GetListingInput>;

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function getListing(raw: unknown) {
  const input = GetListingInput.parse(raw);
  const relays = resolveRelays(input.relays);
  const start = Date.now();

  const manager = new NostrManager(relays);
  try {
    const events = await manager.fetch([
      {
        kinds: [30402],
        authors: [input.pubkey],
        "#d": [input.d_tag],
        limit: 1,
      },
    ]);

    const product = events.map(parseTags).find(Boolean) ?? null;

    logger.info({
      tool: "get_listing",
      relay_count: relays.length,
      relays,
      event_count: events.length,
      duration_ms: Date.now() - start,
    });

    if (!product) {
      return {
        found: false,
        listing: null,
        message: `No listing found for pubkey=${input.pubkey} d_tag=${input.d_tag}`,
      };
    }

    return { found: true, listing: product };
  } finally {
    manager.close();
  }
}

// ─── MCP tool definition ──────────────────────────────────────────────────────

export const getListingTool = {
  name: "get_listing",
  description:
    "Fetch a single Shopstr NIP-99 listing by seller pubkey and d-tag. " +
    "Use this to inspect a specific product in detail.",
  inputSchema: {
    type: "object" as const,
    properties: {
      pubkey: {
        type: "string",
        description: "Seller's Nostr public key — 64-char lowercase hex",
        pattern: "^[0-9a-f]{64}$",
      },
      d_tag: {
        type: "string",
        description: "Listing d-tag (NIP-33 slug / unique identifier)",
      },
      relays: {
        type: "array",
        items: { type: "string" },
        description: "Optional allowlisted relay URLs",
      },
    },
    required: ["pubkey", "d_tag"],
  },
};
