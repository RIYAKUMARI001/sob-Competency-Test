/**
 * tests/validation.test.ts
 *
 * Tests for input validation — Zod schema parsing on all tool inputs,
 * relay allowlist enforcement, and expected error shapes.
 */

import { describe, it, expect } from "vitest";
import { ZodError } from "zod";
import { ListListingsInput } from "../src/tools/list-listings.js";
import { GetListingInput } from "../src/tools/get-listing.js";
import { SearchListingsInput } from "../src/tools/search-listings.js";
import { GetSellerProfileInput } from "../src/tools/get-seller-profile.js";
import { GetReviewsInput } from "../src/tools/get-reviews.js";
import { resolveRelays, RelayUrlSchema, DEFAULT_RELAYS } from "../src/config/relay-config.js";

// ─── list_listings schema ─────────────────────────────────────────────────────

describe("ListListingsInput schema", () => {
  it("accepts valid input with defaults", () => {
    const result = ListListingsInput.parse({});
    expect(result.limit).toBe(20);
    expect(result.relays).toBeUndefined();
  });

  it("accepts explicit limit within range", () => {
    expect(ListListingsInput.parse({ limit: 50 }).limit).toBe(50);
  });

  it("rejects limit = 0", () => {
    expect(() => ListListingsInput.parse({ limit: 0 })).toThrow(ZodError);
  });

  it("rejects limit > 100", () => {
    expect(() => ListListingsInput.parse({ limit: 101 })).toThrow(ZodError);
  });

  it("rejects non-integer limit", () => {
    expect(() => ListListingsInput.parse({ limit: 5.5 })).toThrow(ZodError);
  });

  it("accepts since and until timestamps", () => {
    const r = ListListingsInput.parse({ since: 1700000000, until: 1800000000 });
    expect(r.since).toBe(1700000000);
    expect(r.until).toBe(1800000000);
  });
});

// ─── get_listing schema ───────────────────────────────────────────────────────

describe("GetListingInput schema", () => {
  const VALID_PUBKEY = "a".repeat(64);

  it("accepts valid pubkey and d_tag", () => {
    const r = GetListingInput.parse({ pubkey: VALID_PUBKEY, d_tag: "my-listing" });
    expect(r.pubkey).toBe(VALID_PUBKEY);
    expect(r.d_tag).toBe("my-listing");
  });

  it("rejects pubkey with wrong length", () => {
    expect(() =>
      GetListingInput.parse({ pubkey: "abc123", d_tag: "slug" })
    ).toThrow(ZodError);
  });

  it("rejects pubkey with uppercase hex", () => {
    expect(() =>
      GetListingInput.parse({ pubkey: "A".repeat(64), d_tag: "slug" })
    ).toThrow(ZodError);
  });

  it("rejects empty d_tag", () => {
    expect(() =>
      GetListingInput.parse({ pubkey: VALID_PUBKEY, d_tag: "" })
    ).toThrow(ZodError);
  });

  it("requires both pubkey and d_tag", () => {
    expect(() => GetListingInput.parse({ pubkey: VALID_PUBKEY })).toThrow(ZodError);
    expect(() => GetListingInput.parse({ d_tag: "slug" })).toThrow(ZodError);
  });
});

// ─── search_listings schema ───────────────────────────────────────────────────

describe("SearchListingsInput schema", () => {
  it("accepts empty object with defaults", () => {
    const r = SearchListingsInput.parse({});
    expect(r.limit).toBe(20);
  });

  it("accepts all optional fields", () => {
    const r = SearchListingsInput.parse({
      category: "Physical",
      currency: "BTC",
      seller_pubkey: "b".repeat(64),
      min_price: 0,
      max_price: 1,
      limit: 5,
    });
    expect(r.category).toBe("Physical");
    expect(r.currency).toBe("BTC");
  });

  it("rejects negative min_price", () => {
    expect(() => SearchListingsInput.parse({ min_price: -1 })).toThrow(ZodError);
  });

  it("rejects invalid seller_pubkey format", () => {
    expect(() =>
      SearchListingsInput.parse({ seller_pubkey: "not-a-pubkey" })
    ).toThrow(ZodError);
  });
});

// ─── get_seller_profile schema ────────────────────────────────────────────────

describe("GetSellerProfileInput schema", () => {
  it("accepts valid pubkey", () => {
    const r = GetSellerProfileInput.parse({ pubkey: "c".repeat(64) });
    expect(r.pubkey).toBe("c".repeat(64));
  });

  it("rejects missing pubkey", () => {
    expect(() => GetSellerProfileInput.parse({})).toThrow(ZodError);
  });
});

// ─── get_reviews schema ───────────────────────────────────────────────────────

describe("GetReviewsInput schema", () => {
  const SELLER = "d".repeat(64);

  it("accepts valid seller_pubkey", () => {
    const r = GetReviewsInput.parse({ seller_pubkey: SELLER });
    expect(r.seller_pubkey).toBe(SELLER);
    expect(r.limit).toBe(20);
  });

  it("accepts optional d_tag", () => {
    const r = GetReviewsInput.parse({ seller_pubkey: SELLER, d_tag: "my-product" });
    expect(r.d_tag).toBe("my-product");
  });

  it("rejects missing seller_pubkey", () => {
    expect(() => GetReviewsInput.parse({})).toThrow(ZodError);
  });

  it("rejects limit over 100", () => {
    expect(() =>
      GetReviewsInput.parse({ seller_pubkey: SELLER, limit: 999 })
    ).toThrow(ZodError);
  });
});

// ─── Relay allowlist ──────────────────────────────────────────────────────────

describe("Relay allowlist", () => {
  it("resolveRelays returns defaults when no input given", () => {
    const relays = resolveRelays();
    expect(relays.length).toBeGreaterThan(0);
    expect(relays).toEqual([...DEFAULT_RELAYS]);
  });

  it("resolveRelays returns defaults for empty array", () => {
    expect(resolveRelays([])).toEqual([...DEFAULT_RELAYS]);
  });

  it("accepts a known relay URL", () => {
    const first = [...DEFAULT_RELAYS][0];
    expect(() => RelayUrlSchema.parse(first)).not.toThrow();
  });

  it("rejects a URL not in the allowlist", () => {
    expect(() =>
      RelayUrlSchema.parse("wss://evil.attacker.com")
    ).toThrow(ZodError);
  });

  it("rejects a non-wss scheme even if domain matches", () => {
    expect(() =>
      RelayUrlSchema.parse("http://relay.damus.io")
    ).toThrow(ZodError);
  });

  it("rejects a plain string that is not a URL", () => {
    expect(() => RelayUrlSchema.parse("not-a-url")).toThrow(ZodError);
  });

  it("validateRelays via resolveRelays rejects disallowed relay", () => {
    expect(() =>
      resolveRelays(["wss://not-in-allowlist.example.com"])
    ).toThrow(ZodError);
  });
});
