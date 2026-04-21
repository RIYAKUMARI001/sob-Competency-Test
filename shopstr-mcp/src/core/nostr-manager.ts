/**
 * src/core/nostr-manager.ts
 *
 * Read-only NostrManager — a minimal port of utils/nostr/nostr-manager.ts
 * from the main Shopstr app. All write/signing paths are stripped.
 *
 * Wraps nostr-tools SimplePool to provide:
 *   - fetch()    → subscribe → collect → EOSE → resolve
 *   - Signature verification via verifyEvent() on every event
 *   - Hard timeout via withTimeout()
 */

import "websocket-polyfill";
import { SimplePool, verifyEvent } from "nostr-tools";
import type { Filter, Event } from "nostr-tools";
import { withTimeout, TimeoutError } from "../utils/timeout.js";
import { logger } from "../utils/logger.js";
import { FETCH_TIMEOUT_MS } from "../config/relay-config.js";

export type NostrFilter = Filter;
export type NostrEvent = Event;

export class NostrManager {
  private readonly pool: SimplePool;
  private readonly relayUrls: string[];
  private readonly timeoutMs: number;

  constructor(relayUrls: string[], timeoutMs: number = FETCH_TIMEOUT_MS) {
    this.pool = new SimplePool();
    this.relayUrls = relayUrls;
    this.timeoutMs = timeoutMs;
  }

  /**
   * Fetch events matching `filters` from the configured relays.
   *
   * - Subscribes to all relays in parallel
   * - Verifies every incoming event signature (forged events silently dropped)
   * - Resolves on first EOSE from any relay, or after timeout
   * - Automatically closes the subscription when done
   */
  async fetch(filters: NostrFilter[]): Promise<NostrEvent[]> {
    const events: NostrEvent[] = [];
    const seen = new Set<string>();

    const fetchPromise = new Promise<NostrEvent[]>((resolve) => {
      const sub = (this.pool as any).subscribeMany(this.relayUrls, filters, {
        onevent: (event: NostrEvent) => {
          if (seen.has(event.id)) return;          // deduplicate
          seen.add(event.id);
          if (!verifyEvent(event)) {               // drop forged events
            logger.warn({ message: "Dropped event with invalid signature", id: event.id });
            return;
          }
          events.push(event);
        },
        oneose: () => {
          sub.close();
          resolve(events);
        },
      });
    });

    try {
      return await withTimeout(fetchPromise, this.timeoutMs);
    } catch (err) {
      if (err instanceof TimeoutError) {
        logger.warn({
          message: `Relay fetch timed out after ${this.timeoutMs}ms — returning ${events.length} partial events`,
          relays: this.relayUrls,
        });
        return events;           // return whatever arrived before timeout
      }
      throw err;
    }
  }

  /** Release all relay connections */
  close(): void {
    this.pool.close(this.relayUrls);
  }
}
