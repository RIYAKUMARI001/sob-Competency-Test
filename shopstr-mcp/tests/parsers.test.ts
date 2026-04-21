/**
 * tests/parsers.test.ts
 *
 * Unit tests for parseTags(), parseProfile(), parseShopProfile(), parseReview().
 * All tests are pure — no relay connections needed.
 */

import { describe, it, expect } from "vitest";
import { parseTags, parseProfile, parseShopProfile, parseReview } from "../src/core/parsers.js";
import type { NostrEvent } from "../src/core/nostr-manager.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<NostrEvent> = {}): NostrEvent {
  return {
    id: "a".repeat(64),
    pubkey: "b".repeat(64),
    created_at: 1_700_000_000,
    kind: 30402,
    tags: [],
    content: "",
    sig: "c".repeat(128),
    ...overrides,
  };
}

// ─── parseTags ────────────────────────────────────────────────────────────────

describe("parseTags()", () => {
  it("returns undefined when tags are missing", () => {
    const event = makeEvent({ tags: undefined as unknown as string[][] });
    expect(parseTags(event)).toBeUndefined();
  });

  it("populates core identity fields from event", () => {
    const event = makeEvent({
      tags: [
        ["title", "Test Wallet"],
        ["price", "0.0001", "BTC"],
      ],
    });
    const p = parseTags(event)!;
    expect(p.id).toBe(event.id);
    expect(p.pubkey).toBe(event.pubkey);
    expect(p.createdAt).toBe(event.created_at);
  });

  it("parses title, summary, published_at", () => {
    const event = makeEvent({
      tags: [
        ["title", "Leather Wallet"],
        ["summary", "A great wallet"],
        ["published_at", "1700000000"],
      ],
    });
    const p = parseTags(event)!;
    expect(p.title).toBe("Leather Wallet");
    expect(p.summary).toBe("A great wallet");
    expect(p.publishedAt).toBe("1700000000");
  });

  it("parses price and currency", () => {
    const event = makeEvent({ tags: [["price", "0.00015", "BTC"]] });
    const p = parseTags(event)!;
    expect(p.price).toBe(0.00015);
    expect(p.currency).toBe("BTC");
  });

  it("accumulates multiple images", () => {
    const event = makeEvent({
      tags: [
        ["image", "https://example.com/1.jpg"],
        ["image", "https://example.com/2.jpg"],
      ],
    });
    const p = parseTags(event)!;
    expect(p.images).toHaveLength(2);
    expect(p.images[0]).toBe("https://example.com/1.jpg");
  });

  it("accumulates category tags", () => {
    const event = makeEvent({
      tags: [["t", "Physical"], ["t", "Accessories"]],
    });
    const p = parseTags(event)!;
    expect(p.categories).toEqual(["Physical", "Accessories"]);
  });

  it("parses shipping type and cost correctly", () => {
    const event = makeEvent({
      tags: [["shipping", "Added Cost", "0.00002"], ["price", "0.0001", "BTC"]],
    });
    const p = parseTags(event)!;
    expect(p.shippingType).toBe("Added Cost");
    expect(p.shippingCost).toBe(0.00002);
    expect(p.totalCost).toBeCloseTo(0.00012);
  });

  it("parses shipping N/A with zero cost", () => {
    const event = makeEvent({ tags: [["shipping", "N/A"]] });
    const p = parseTags(event)!;
    expect(p.shippingType).toBe("N/A");
    expect(p.totalCost).toBe(0);
  });

  it("parses sizes with quantities", () => {
    const event = makeEvent({
      tags: [
        ["size", "S", "5"],
        ["size", "M", "10"],
      ],
    });
    const p = parseTags(event)!;
    expect(p.sizes).toEqual(["S", "M"]);
    expect(p.sizeQuantities!["S"]).toBe(5);
    expect(p.sizeQuantities!["M"]).toBe(10);
  });

  it("parses volume pricing", () => {
    const event = makeEvent({
      tags: [
        ["volume", "150ml", "0.00004"],
        ["volume", "300ml", "0.00007"],
      ],
    });
    const p = parseTags(event)!;
    expect(p.volumes).toEqual(["150ml", "300ml"]);
    expect(p.volumePrices!["150ml"]).toBeCloseTo(0.00004);
  });

  it("parses bulk pricing", () => {
    const event = makeEvent({ tags: [["bulk", "10", "0.0009"]] });
    const p = parseTags(event)!;
    expect(p.bulkPrices![10]).toBeCloseTo(0.0009);
  });

  it("sets contentWarning via content-warning tag", () => {
    const event = makeEvent({ tags: [["content-warning"]] });
    expect(parseTags(event)!.contentWarning).toBe(true);
  });

  it("sets contentWarning via L label namespace tag", () => {
    const event = makeEvent({ tags: [["L", "content-warning"]] });
    expect(parseTags(event)!.contentWarning).toBe(true);
  });

  it("parses expiration via valid_until", () => {
    const event = makeEvent({ tags: [["valid_until", "1800000000"]] });
    expect(parseTags(event)!.expiration).toBe(1800000000);
  });

  it("parses pickup_location", () => {
    const event = makeEvent({
      tags: [["pickup_location", "Portland Market — Booth #12"]],
    });
    const p = parseTags(event)!;
    expect(p.pickupLocations).toContain("Portland Market — Booth #12");
  });

  it("ignores unknown tag keys without throwing", () => {
    const event = makeEvent({
      tags: [["unknown_future_tag", "some_value"], ["title", "OK"]],
    });
    expect(() => parseTags(event)).not.toThrow();
    expect(parseTags(event)!.title).toBe("OK");
  });

  it("totalCost equals price when no shipping cost", () => {
    const event = makeEvent({ tags: [["price", "0.001", "BTC"], ["shipping", "Free"]] });
    const p = parseTags(event)!;
    expect(p.totalCost).toBe(0.001);
  });
});

// ─── parseProfile ─────────────────────────────────────────────────────────────

describe("parseProfile()", () => {
  it("parses a full kind:0 profile", () => {
    const event = makeEvent({
      kind: 0,
      content: JSON.stringify({
        name: "Alice",
        picture: "https://example.com/alice.jpg",
        about: "BTC seller",
        lud16: "alice@wallet.io",
        nip05: "alice@shopstr.store",
      }),
    });
    const p = parseProfile(event)!;
    expect(p.name).toBe("Alice");
    expect(p.lud16).toBe("alice@wallet.io");
    expect(p.nip05).toBe("alice@shopstr.store");
    expect(p.pubkey).toBe(event.pubkey);
  });

  it("returns undefined on invalid JSON content", () => {
    const event = makeEvent({ kind: 0, content: "not-json" });
    expect(parseProfile(event)).toBeUndefined();
  });

  it("returns partial profile when only some fields present", () => {
    const event = makeEvent({ kind: 0, content: JSON.stringify({ name: "Bob" }) });
    const p = parseProfile(event)!;
    expect(p.name).toBe("Bob");
    expect(p.lud16).toBeUndefined();
  });
});

// ─── parseShopProfile ─────────────────────────────────────────────────────────

describe("parseShopProfile()", () => {
  it("parses a valid kind:30019 event", () => {
    const event = makeEvent({
      kind: 30019,
      content: JSON.stringify({
        name: "Alice's Shop",
        about: "Best BTC goods",
        ui: { picture: "https://pic.url", banner: "https://banner.url" },
        merchants: ["b".repeat(64)],
        freeShippingThreshold: 0.001,
        freeShippingCurrency: "BTC",
      }),
    });
    const s = parseShopProfile(event)!;
    expect(s.name).toBe("Alice's Shop");
    expect(s.picture).toBe("https://pic.url");
    expect(s.merchants).toHaveLength(1);
    expect(s.freeShippingThreshold).toBe(0.001);
  });

  it("returns undefined on malformed JSON", () => {
    const event = makeEvent({ kind: 30019, content: "{broken" });
    expect(parseShopProfile(event)).toBeUndefined();
  });
});

// ─── parseReview ──────────────────────────────────────────────────────────────

describe("parseReview()", () => {
  it("parses a valid kind:31925 review event", () => {
    const sellerPubkey = "d".repeat(64);
    const event = makeEvent({
      kind: 31925,
      content: "Great seller, fast shipping!",
      tags: [
        ["a", `30402:${sellerPubkey}:my-listing`],
        ["rating", "4.5"],
      ],
    });
    const r = parseReview(event)!;
    expect(r.merchantPubkey).toBe(sellerPubkey);
    expect(r.productDTag).toBe("my-listing");
    expect(r.score).toBe(4.5);
    expect(r.content).toBe("Great seller, fast shipping!");
  });

  it("returns undefined when no 'a' tag references a product", () => {
    const event = makeEvent({ kind: 31925, tags: [["rating", "3"]] });
    expect(parseReview(event)).toBeUndefined();
  });

  it("clamps score to 0–5 range", () => {
    const seller = "e".repeat(64);
    const overEvent = makeEvent({
      kind: 31925,
      tags: [["a", `30402:${seller}:slug`], ["rating", "99"]],
    });
    const underEvent = makeEvent({
      kind: 31925,
      tags: [["a", `30402:${seller}:slug`], ["rating", "-1"]],
    });
    expect(parseReview(overEvent)!.score).toBe(5);
    expect(parseReview(underEvent)!.score).toBe(0);
  });
});
