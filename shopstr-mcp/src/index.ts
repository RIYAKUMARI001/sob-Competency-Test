#!/usr/bin/env node
/**
 * src/index.ts — Shopstr MCP Server entry point
 *
 * Starts an MCP server over stdio transport. The server is strictly read-only:
 * it exposes 6 tools for browsing Shopstr NIP-99 listings, seller profiles,
 * shop configs, and reviews. No signing, wallet, or checkout surfaces.
 *
 * Usage:
 *   npx shopstr-mcp          (after npm install)
 *   npx tsx src/index.ts     (dev mode)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { ZodError } from "zod";

import { listListingsTool,   listListings   } from "./tools/list-listings.js";
import { getListingTool,     getListing     } from "./tools/get-listing.js";
import { searchListingsTool, searchListings } from "./tools/search-listings.js";
import { getSellerProfileTool, getSellerProfile } from "./tools/get-seller-profile.js";
import { getShopProfileTool,   getShopProfile   } from "./tools/get-shop-profile.js";
import { getReviewsTool,       getReviews       } from "./tools/get-reviews.js";
import { logger } from "./utils/logger.js";

// ─── Tool registry ────────────────────────────────────────────────────────────

const TOOLS = [
  listListingsTool,
  getListingTool,
  searchListingsTool,
  getSellerProfileTool,
  getShopProfileTool,
  getReviewsTool,
] as const;

type ToolName = (typeof TOOLS)[number]["name"];

const HANDLERS: Record<ToolName, (input: unknown) => Promise<unknown>> = {
  list_listings:      listListings,
  get_listing:        getListing,
  search_listings:    searchListings,
  get_seller_profile: getSellerProfile,
  get_shop_profile:   getShopProfile,
  get_reviews:        getReviews,
};

// ─── MCP Server ───────────────────────────────────────────────────────────────

const server = new Server(
  {
    name: "shopstr-mcp",
    version: "0.1.0",
  },
  {
    capabilities: { tools: {} },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  })),
}));

// Call a tool
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  const handler = HANDLERS[name as ToolName];
  if (!handler) {
    return {
      content: [{ type: "text", text: `Unknown tool: "${name}"` }],
      isError: true,
    };
  }

  try {
    const result = await handler(args ?? {});
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (err) {
    // Zod validation errors → structured error message
    if (err instanceof ZodError) {
      const msg = err.errors
        .map((e) => `${e.path.join(".")}: ${e.message}`)
        .join("; ");
      logger.warn({ tool: name, message: "Input validation failed", error: msg });
      return {
        content: [{ type: "text", text: `Validation error: ${msg}` }],
        isError: true,
      };
    }

    // All other errors
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ tool: name, error: message });
    return {
      content: [{ type: "text", text: `Tool error: ${message}` }],
      isError: true,
    };
  }
});

// ─── Bootstrap ────────────────────────────────────────────────────────────────

async function main() {
  logger.info({
    message: "Shopstr MCP server starting (read-only mode)",
    tools: TOOLS.map((t) => t.name),
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info({ message: "Shopstr MCP server ready — listening on stdio" });
}

main().catch((err) => {
  logger.error({ message: "Fatal server error", error: String(err) });
  process.exit(1);
});
