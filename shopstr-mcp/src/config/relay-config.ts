/**
 * src/config/relay-config.ts
 *
 * Relay allowlist and validation.
 *
 * SECURITY: Callers may pass relay URLs as tool inputs. To prevent SSRF,
 * every URL is checked against ALLOWED_RELAYS before a connection is opened.
 * Operators can extend the list via the SHOPSTR_MCP_RELAYS environment variable
 * (comma-separated WSS URLs).
 */

import { z } from "zod";

// ─── Built-in defaults ────────────────────────────────────────────────────────

export const DEFAULT_RELAYS: readonly string[] = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.nostr.band",
  "wss://nostr.wine",
  "wss://relay.snort.social",
  "wss://relay.primal.net",
];

// ─── Operator-supplied extra relays (env) ─────────────────────────────────────

function parseEnvRelays(): string[] {
  const raw = process.env["SHOPSTR_MCP_RELAYS"];
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export const ALLOWED_RELAYS: ReadonlySet<string> = new Set([
  ...DEFAULT_RELAYS,
  ...parseEnvRelays(),
]);

// ─── Timeout config ───────────────────────────────────────────────────────────

export const FETCH_TIMEOUT_MS: number = (() => {
  const raw = process.env["SHOPSTR_MCP_TIMEOUT_MS"];
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return isNaN(parsed) ? 15_000 : parsed;
})();

// ─── Validation ───────────────────────────────────────────────────────────────

/** Zod schema: a single relay URL — must be in the allowlist */
export const RelayUrlSchema = z
  .string()
  .url()
  .refine(
    (url) => url.startsWith("wss://") || url.startsWith("ws://"),
    { message: "Relay URL must use wss:// or ws:// scheme" }
  )
  .refine(
    (url) => ALLOWED_RELAYS.has(url),
    (url) => ({
      message: `Relay "${url}" is not in the allowlist. Allowed: ${[...ALLOWED_RELAYS].join(", ")}`,
    })
  );

/** Validate a list of relay URLs; throws ZodError on any violation */
export function validateRelays(relays: unknown[]): string[] {
  return relays.map((r) => RelayUrlSchema.parse(r));
}

/** Return caller-supplied relays (validated) or fall back to defaults */
export function resolveRelays(input?: string[]): string[] {
  if (!input || input.length === 0) return [...DEFAULT_RELAYS];
  return validateRelays(input);
}
