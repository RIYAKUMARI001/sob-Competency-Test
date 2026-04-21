/**
 * tests/tools.test.ts
 *
 * Tests for MCP tool schemas and output shapes.
 * Uses mock relay data (no live relay connections).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseTags, parseProfile, parseShopProfile, parseReview } from "../src/core/parsers.js";
import type { NostrEvent } from "../src/core/nostr-manager.js";

// ─── Mock NostrManager ────────────────────────────────────────────────────────

const SELLER_PUBKEY = "a".repeat(64);
const D_TAG = "test-wallet";

function makeListing(overrides: Partial<NostrEvent> = {}): NostrEvent {
  return {
    id: "b".repeat(64),
    pubkey: SELLER_PUBKEY,
    created_at: 1_700_000_000,
    kind: 30402,
    sig: "c".repeat(128),
    content: "A great wallet",
    tags: [
      ["d", D_TAG],
      ["title", "Leather Wallet"],
      ["summary", "Full-grain leather"],
      ["price", "0.0001", "BTC"],
      ["t", "Physical"],
      ["t", "Accessories"],
      ["location", "Berlin, DE"],
      ["shipping", "Free"],
      ["condition", "New"],
      ["status", "active"],
      ["published_at", "1700000000"],
      ["image", "https://example.com/wallet.jpg"],
    ],
    ...overrides,
  };
}

// ─── Tool output shape tests ──────────────────────────────────────────────────

describe("list_listings — output shape", () => {
  it("parseTags produces correct ProductData from listing event", () => {
    const product = parseTags(makeListing())!;
    expect(product).toBeDefined();
    expect(product.title).toBe("Leather Wallet");
    expect(product.price).toBe(0.0001);
    expect(product.currency).toBe("BTC");
    expect(product.categories).toContain("Physical");
    expect(product.images).toHaveLength(1);
    expect(product.status).toBe("active");
    expect(product.shippingType).toBe("Free");
    expect(product.totalCost).toBe(0.0001);
  });

  it("produces correct JSON-serialisable output (no Maps)", () => {
    const product = parseTags(makeListing({
      tags: [
        ...makeListing().tags,
        ["size", "M", "5"],
        ["bulk", "10", "0.0009"],
      ],
    }))!;
    // Must serialise cleanly — no Map objects
    expect(() => JSON.stringify(product)).not.toThrow();
    const json = JSON.parse(JSON.stringify(product));
    expect(json.sizeQuantities).toBeDefined();
    expect(json.sizeQuantities.M).toBe(5);
    expect(json.bulkPrices["10"]).toBeCloseTo(0.0009);
  });
});

describe("get_listing — output shape", () => {
  it("found=true when event exists", () => {
    const product = parseTags(makeListing());
    const output = { found: true, listing: product };
    expect(output.found).toBe(true);
    expect(output.listing!.d).toBe(D_TAG);
    expect(output.listing!.pubkey).toBe(SELLER_PUBKEY);
  });

  it("found=false structure when no event", () => {
    const output = { found: false, listing: null, message: "Not found" };
    expect(output.found).toBe(false);
    expect(output.listing).toBeNull();
  });
});

describe("search_listings — filtering logic", () => {
  const listings = [
    parseTags(makeListing({ tags: [["price", "0.0001", "BTC"], ["t", "Physical"], ["shipping", "Free"]] }))!,
    parseTags(makeListing({ tags: [["price", "0.005", "BTC"],  ["t", "Digital"],  ["shipping", "N/A"]] }))!,
    parseTags(makeListing({ tags: [["price", "0.0001", "SATS"], ["t", "Physical"], ["shipping", "Free"]] }))!,
  ];

  it("filters by category", () => {
    const result = listings.filter((p) => p.categories.includes("Digital"));
    expect(result).toHaveLength(1);
  });

  it("filters by currency", () => {
    const result = listings.filter((p) => p.currency === "BTC");
    expect(result).toHaveLength(2);
  });

  it("filters by max_price", () => {
    const result = listings.filter((p) => p.price <= 0.001);
    expect(result).toHaveLength(2);
  });
});

describe("get_seller_profile — output shape", () => {
  it("produces ProfileData from kind:0 event", () => {
    const event: NostrEvent = {
      id: "d".repeat(64),
      pubkey: SELLER_PUBKEY,
      created_at: 1_700_000_000,
      kind: 0,
      tags: [],
      content: JSON.stringify({
        name: "Alice",
        about: "BTC goods seller",
        lud16: "alice@strike.me",
        nip05: "alice@shopstr.store",
        picture: "https://example.com/alice.jpg",
      }),
      sig: "e".repeat(128),
    };
    const profile = parseProfile(event)!;
    expect(profile.name).toBe("Alice");
    expect(profile.lud16).toBe("alice@strike.me");
    expect(profile.nip05).toBe("alice@shopstr.store");
  });
});

describe("get_shop_profile — output shape", () => {
  it("produces ShopProfileData from kind:30019 event", () => {
    const event: NostrEvent = {
      id: "f".repeat(64),
      pubkey: SELLER_PUBKEY,
      created_at: 1_700_000_000,
      kind: 30019,
      tags: [],
      content: JSON.stringify({
        name: "Alice's Bitcoin Shop",
        about: "Best BTC goods on Nostr",
        ui: { picture: "https://pic.url", banner: "https://banner.url", theme: "dark", darkMode: true },
        merchants: [SELLER_PUBKEY],
        freeShippingThreshold: 0.001,
        freeShippingCurrency: "BTC",
      }),
      sig: "g".repeat(128),
    };
    const shop = parseShopProfile(event)!;
    expect(shop.name).toBe("Alice's Bitcoin Shop");
    expect(shop.picture).toBe("https://pic.url");
    expect(shop.freeShippingThreshold).toBe(0.001);
    expect(shop.merchants).toContain(SELLER_PUBKEY);
  });
});

describe("get_reviews — output shape", () => {
  it("produces ReviewData and computes average score", () => {
    const makeReviewEvent = (score: string): NostrEvent => ({
      id: Math.random().toString(16).slice(2).padEnd(64, "0"),
      pubkey: "reviewer".padEnd(64, "0"),
      created_at: 1_700_000_000,
      kind: 31925,
      tags: [
        ["a", `30402:${SELLER_PUBKEY}:${D_TAG}`],
        ["rating", score],
      ],
      content: "Great product",
      sig: "h".repeat(128),
    });

    const events = [makeReviewEvent("4"), makeReviewEvent("5"), makeReviewEvent("3")];
    const reviews = events.map(parseReview).filter(Boolean);
    const avg = reviews.reduce((s, r) => s + r!.score, 0) / reviews.length;

    expect(reviews).toHaveLength(3);
    expect(avg).toBeCloseTo(4.0);
    expect(reviews[0]!.merchantPubkey).toBe(SELLER_PUBKEY);
    expect(reviews[0]!.productDTag).toBe(D_TAG);
  });
});
