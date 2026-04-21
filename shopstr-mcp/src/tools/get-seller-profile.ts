/**
 * src/tools/get-seller-profile.ts
 *
 * MCP Tool: get_seller_profile
 * Fetch a seller's kind:0 (NIP-01 metadata) Nostr profile by pubkey.
 */

import { z } from "zod";
import { NostrManager } from "../core/nostr-manager.js";
import { parseProfile } from "../core/parsers.js";
import { resolveRelays } from "../config/relay-config.js";
import { logger } from "../utils/logger.js";

// ─── Input schema ─────────────────────────────────────────────────────────────

export const GetSellerProfileInput = z.object({
  pubkey: z
    .string()
    .regex(/^[0-9a-f]{64}$/, "pubkey must be a 64-character lowercase hex string")
    .describe("Seller's Nostr public key (hex)"),
  relays: z
    .array(z.string())
    .optional()
    .describe("Optional allowlisted relay URLs"),
});

export type GetSellerProfileInput = z.infer<typeof GetSellerProfileInput>;

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function getSellerProfile(raw: unknown) {
  const input = GetSellerProfileInput.parse(raw);
  const relays = resolveRelays(input.relays);
  const start = Date.now();

  const manager = new NostrManager(relays);
  try {
    const events = await manager.fetch([
      { kinds: [0], authors: [input.pubkey], limit: 1 },
    ]);

    // kind:0 is replaceable — use the most recent event
    const latest = events.sort((a, b) => b.created_at - a.created_at)[0];
    const profile = latest ? parseProfile(latest) : null;

    logger.info({
      tool: "get_seller_profile",
      relay_count: relays.length,
      relays,
      event_count: events.length,
      duration_ms: Date.now() - start,
    });

    if (!profile) {
      return {
        found: false,
        profile: null,
        message: `No profile found for pubkey=${input.pubkey}`,
      };
    }

    return { found: true, profile };
  } finally {
    manager.close();
  }
}

// ─── MCP tool definition ──────────────────────────────────────────────────────

export const getSellerProfileTool = {
  name: "get_seller_profile",
  description:
    "Fetch a Shopstr seller's Nostr kind:0 metadata profile by pubkey. " +
    "Returns name, picture, about, Lightning address (lud16), and NIP-05 handle.",
  inputSchema: {
    type: "object" as const,
    properties: {
      pubkey: {
        type: "string",
        description: "Seller's Nostr hex pubkey (64 lowercase hex chars)",
        pattern: "^[0-9a-f]{64}$",
      },
      relays: {
        type: "array",
        items: { type: "string" },
        description: "Optional allowlisted relay URLs",
      },
    },
    required: ["pubkey"],
  },
};
