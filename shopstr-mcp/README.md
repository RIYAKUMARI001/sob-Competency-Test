# Shopstr MCP Server

This is my implementation of a Model Context Protocol (MCP) server for the Shopstr marketplace. The goal was to build a clean way for AI agents to browse listings and inspect sellers without having to deal with the complexities of Nostr signing or wallet management.

I've ported the core parsing logic from the main Shopstr app and wrapped it into a standalone package that works over stdio.

## Why I built this
Shopstr has a lot of great marketplace data (NIP-99), but it's usually locked inside the web app. By making an MCP server, I've opened up this data so that LLMs (like Claude) can actually "see" what's being sold on the decentralized web, check seller reputations, and search for products using natural language.

## What's inside
I've implemented 6 tools that cover the basic read path of the marketplace:
- **Product Browsing**: `list_listings` and `search_listings` (with price/category filters).
- **Deep Dive**: `get_listing` to see full details of a specific item.
- **Profiles**: `get_seller_profile` and `get_shop_profile` to know who you're buying from.
- **Reputation**: `get_reviews` to aggregate and read NIP-99 reviews.

## How to run it
You'll need Node 18+ and a way to run MCP (like Claude Desktop or the MCP Inspector).

```bash
# Get dependencies
npm install

# Build the TS files
npm run build

# To test if it's working
npm test
```

### Competency Task Demo
I've included a standalone script in the `demo/` folder that I used for the initial competency test. It fetches live data and generates a field presence report.

```bash
npx tsx demo/fetch-listings.ts --mock
```

## Some technical notes
- **Safety**: Since this is for agents, I've added a relay allowlist to prevent the server from connecting to random/malicious URLs.
- **Robustness**: Nostr relays can be slow, so every fetch has a hard-coded 15s timeout to keep the agent from hanging.
- **Data Integrity**: Every event is signature-verified using `nostr-tools`.

I've tried to keep the code as clean as possible, following the patterns used in the main Shopstr repository.
