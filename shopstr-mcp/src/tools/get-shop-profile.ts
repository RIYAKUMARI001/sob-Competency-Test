/**
 * src/tools/get-shop-profile.ts
 *
 * MCP Tool: get_shop_profile
 * Fetch a seller's kind:30019 Shopstr shop profile (storefront config).
 */

import { z } from "zod";
import { NostrManager } from "../core/nostr-manager.js";
import { parseShopProfile } from "../core/parsers.js";
import { resolveRelays } from "../config/relay-config.js";
import { logger } from "../utils/logger.js";

// ─── Input schema ─────────────────────────────────────────────────────────────

export const GetShopProfileInput = z.object({
  pubkey: z
    .string()
    .regex(/^[0-9a-f]{64}$/, "pubkey must be a 64-character lowercase hex string")
    .describe("Seller's Nostr public key (hex)"),
  relays: z
    .array(z.string())
    .optional()
    .describe("Optional allowlisted relay URLs"),
});

export type GetShopProfileInput = z.infer<typeof GetShopProfileInput>;

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function getShopProfile(raw: unknown) {
  const input = GetShopProfileInput.parse(raw);
  const relays = resolveRelays(input.relays);
  const start = Date.now();

  const manager = new NostrManager(relays);
  try {
    const events = await manager.fetch([
      { kinds: [30019], authors: [input.pubkey], limit: 1 },
    ]);

    // kind:30019 is parameterised replaceable — pick most recent
    const latest = events.sort((a, b) => b.created_at - a.created_at)[0];
    const shopProfile = latest ? parseShopProfile(latest) : null;

    logger.info({
      tool: "get_shop_profile",
      relay_count: relays.length,
      relays,
      event_count: events.length,
      duration_ms: Date.now() - start,
    });

    if (!shopProfile) {
      return {
        found: false,
        shop_profile: null,
        message: `No shop profile (kind:30019) found for pubkey=${input.pubkey}`,
      };
    }

    return { found: true, shop_profile: shopProfile };
  } finally {
    manager.close();
  }
}

// ─── MCP tool definition ──────────────────────────────────────────────────────

export const getShopProfileTool = {
  name: "get_shop_profile",
  description:
    "Fetch a seller's Shopstr kind:30019 shop profile by pubkey. " +
    "Returns shop name, about, banner, free-shipping threshold, and linked merchant pubkeys.",
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
