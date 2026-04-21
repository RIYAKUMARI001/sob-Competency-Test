/**
 * src/utils/logger.ts
 *
 * Audit logger — emits structured JSON lines to stderr so the MCP host
 * can capture them without polluting the stdout MCP protocol stream.
 *
 * Each log line is a JSON object on a single line (JSONL format):
 *   { "ts": "ISO8601", "level": "info|warn|error", "tool": "...", ...fields }
 */

export type LogLevel = "info" | "warn" | "error";

export interface AuditEntry {
  ts: string;
  level: LogLevel;
  tool?: string;
  relays?: string[];
  relay_count?: number;
  event_count?: number;
  duration_ms?: number;
  message?: string;
  error?: string;
  [key: string]: unknown;
}

function emit(entry: AuditEntry): void {
  process.stderr.write(JSON.stringify(entry) + "\n");
}

export const logger = {
  info(fields: Omit<AuditEntry, "ts" | "level">): void {
    emit({ ts: new Date().toISOString(), level: "info", ...fields });
  },
  warn(fields: Omit<AuditEntry, "ts" | "level">): void {
    emit({ ts: new Date().toISOString(), level: "warn", ...fields });
  },
  error(fields: Omit<AuditEntry, "ts" | "level">): void {
    emit({ ts: new Date().toISOString(), level: "error", ...fields });
  },
};

/**
 * Helper: wrap an async tool handler and automatically log timing + event count.
 */
export async function withAudit<T extends { events?: unknown[] }>(
  tool: string,
  relays: string[],
  fn: () => Promise<T>
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    logger.info({
      tool,
      relay_count: relays.length,
      relays,
      event_count: Array.isArray(result.events) ? result.events.length : undefined,
      duration_ms: Date.now() - start,
    });
    return result;
  } catch (err) {
    logger.error({
      tool,
      relay_count: relays.length,
      relays,
      duration_ms: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
