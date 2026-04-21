/**
 * src/tools/get-reviews.ts
 *
 * MCP Tool: get_reviews
 * Fetch NIP-99 product/seller reviews (kind:31925) from the relay network.
 */

import { z } from "zod";
import { NostrManager } from "../core/nostr-manager.js";
import { parseReview } from "../core/parsers.js";
import { resolveRelays } from "../config/relay-config.js";
import { logger } from "../utils/logger.js";

// ─── Input schema ─────────────────────────────────────────────────────────────

export const GetReviewsInput = z.object({
  seller_pubkey: z
    .string()
    .regex(/^[0-9a-f]{64}$/, "pubkey must be a 64-character lowercase hex string")
    .describe("Seller's Nostr public key — fetch reviews for this seller's products"),
  d_tag: z
    .string()
    .optional()
    .describe("Optional: narrow to reviews for a specific listing d-tag"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .describe("Max reviews to return (1–100)"),
  relays: z
    .array(z.string())
    .optional()
    .describe("Optional allowlisted relay URLs"),
});

export type GetReviewsInput = z.infer<typeof GetReviewsInput>;

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function getReviews(raw: unknown) {
  const input = GetReviewsInput.parse(raw);
  const relays = resolveRelays(input.relays);
  const start = Date.now();

  // Build the #a tag address to query reviews for
  // Format: "30402:<seller-pubkey>:<d-tag>"  (NIP-99 product address)
  const addressFilters = input.d_tag
    ? [`30402:${input.seller_pubkey}:${input.d_tag}`]
    : undefined;

  const filter: Record<string, unknown> = {
    kinds: [31925],
    limit: input.limit,
  };
  if (addressFilters) filter["#a"] = addressFilters;

  const manager = new NostrManager(relays);
  try {
    const events = await manager.fetch([filter as Parameters<typeof manager.fetch>[0][0]]);

    // Parse and filter to only reviews referencing this seller
    let reviews = events
      .map(parseReview)
      .filter(Boolean)
      .filter((r) => r!.merchantPubkey === input.seller_pubkey);

    if (input.d_tag) {
      reviews = reviews.filter((r) => r!.productDTag === input.d_tag);
    }

    const sliced = reviews.slice(0, input.limit);

    // Compute aggregate score
    const avgScore =
      sliced.length > 0
        ? sliced.reduce((sum, r) => sum + r!.score, 0) / sliced.length
        : null;

    logger.info({
      tool: "get_reviews",
      relay_count: relays.length,
      relays,
      event_count: events.length,
      duration_ms: Date.now() - start,
    });

    return {
      count: sliced.length,
      average_score: avgScore !== null ? Math.round(avgScore * 100) / 100 : null,
      reviews: sliced,
    };
  } finally {
    manager.close();
  }
}

// ─── MCP tool definition ──────────────────────────────────────────────────────

export const getReviewsTool = {
  name: "get_reviews",
  description:
    "Fetch NIP-99 product reviews (kind:31925) for a Shopstr seller. " +
    "Optionally narrow to a specific listing d-tag. Returns reviews and average score.",
  inputSchema: {
    type: "object" as const,
    properties: {
      seller_pubkey: {
        type: "string",
        description: "Seller's Nostr hex pubkey (64 lowercase hex chars)",
        pattern: "^[0-9a-f]{64}$",
      },
      d_tag: {
        type: "string",
        description: "Optional listing d-tag to scope reviews to a specific product",
      },
      limit: {
        type: "number",
        description: "Max reviews to return (1–100, default 20)",
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
    required: ["seller_pubkey"],
  },
};
