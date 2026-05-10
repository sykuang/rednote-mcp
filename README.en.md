# rednote-mcp (Node.js)

[![npm](https://img.shields.io/npm/v/@sykuang/rednote-mcp.svg)](https://www.npmjs.com/package/@sykuang/rednote-mcp)

[繁體中文](./README.md) | English

MCP server for rednote.com (the overseas version of Xiaohongshu / REDNOTE).

This project is the **overseas (REDNOTE) port** of [xpzouying/xiaohongshu-mcp](https://github.com/xpzouying/xiaohongshu-mcp), reimplemented in Node.js + TypeScript + Playwright so users can install and run it directly with `npx`, no compilation required.

## Features

Provides 13 MCP tools:

| Tool | Description |
|------|-------------|
| `check_login_status` | Check login status |
| `get_login_qrcode` | Get login QR code |
| `delete_cookies` | Delete cookies and reset login |
| `list_feeds` | Fetch home feeds |
| `search_feeds` | Search notes (with filters) |
| `get_feed_detail` | Fetch note detail + comments |
| `user_profile` | Fetch a user's profile page |
| `post_comment_to_feed` | Post a comment |
| `reply_comment_in_feed` | Reply to a comment |
| `like_feed` / `favorite_feed` | Like / favorite |
| `publish_content` | Publish image post |
| `publish_with_video` | Publish video post |

It also exposes an HTTP API (`/api/v1/*`) and MCP Streamable HTTP (`/mcp`).

## Installation

### Option 1: Run with npx (recommended)

```bash
# stdio mode (for MCP clients)
npx -y @sykuang/rednote-mcp --stdio

# HTTP mode
npx -y @sykuang/rednote-mcp --port :18060

# All options
npx -y @sykuang/rednote-mcp --help
```

The first run will automatically download Chromium (~170MB, one-time).

#### Claude Desktop / Cursor config example

```json
{
  "mcpServers": {
    "rednote": {
      "command": "npx",
      "args": ["-y", "@sykuang/rednote-mcp", "--stdio"]
    }
  }
}
```

### Option 2: Global install

```bash
npm install -g @sykuang/rednote-mcp
rednote-mcp --stdio
```

### Option 3: From source

```bash
git clone https://github.com/sykuang/rednote-mcp.git
cd rednote-mcp
npm install
npm run build
node dist/main.js --stdio
```

## Usage

HTTP mode (defaults to `:18060`):

```bash
npx @sykuang/rednote-mcp --port :18060
# or from source: node dist/main.js --port :18060
```

stdio mode (for Claude Desktop / Cursor and other MCP clients):

```bash
npx @sykuang/rednote-mcp --stdio
# or
MCP_STDIO=1 node dist/main.js
```

CLI flags:
- `--headless` true/false (default: true)
- `--bin /path/to/chromium` (or use the `ROD_BROWSER_BIN` env var)
- `--port :18060`
- `--stdio`

Environment variables:
- `MCP_STDIO=1` — enable stdio mode
- `ROD_BROWSER_BIN` — path to a Chromium executable
- `COOKIES_PATH` — cookies file path (falls back to `/tmp/cookies.json`, then `./cookies.json`)
- `XHS_PROXY` — HTTP/HTTPS proxy URL

## Development

```bash
npm run dev          # run with tsx
npm run build        # compile to dist/
npm run format       # prettier
npm run lint         # tsc --noEmit
```

## Docker

### Use the prebuilt image (GHCR)

```bash
docker run -d --name rednote-mcp \
  -p 18060:18060 \
  -v $(pwd)/cookies.json:/app/cookies.json \
  --shm-size=1g \
  ghcr.io/sykuang/rednote-mcp:latest
```

### docker compose

```bash
# After obtaining cookies.json (see the login flow below), start with:
docker compose up -d
docker compose logs -f
```

The bundled `docker-compose.yml` includes:
- Prebuilt GHCR image (`ghcr.io/sykuang/rednote-mcp:latest`)
- Persistent `cookies.json` mount
- `shm_size: 1gb` (required by Chromium subprocess)

### Build from source

```bash
docker build -t rednote-mcp-node .
docker run -p 18060:18060 -v $(pwd)/cookies.json:/app/cookies.json rednote-mcp-node
```

## Differences from the Go version

This project is a port of [xpzouying/xiaohongshu-mcp](https://github.com/xpzouying/xiaohongshu-mcp) (Xiaohongshu China site, written in Go) targeting the **overseas REDNOTE site**:

- **Target site**: original targets `xiaohongshu.com` (China); this port targets `rednote.com` (overseas)
- **Language**: Go → **Node.js / TypeScript** (no compilation needed for `npx` users, cross-platform)
- Uses **Playwright** in place of go-rod; XHR interception via `page.on('response')` instead of CDP
- HTTP framework: **Fastify** instead of Gin
- MCP via the official **`@modelcontextprotocol/sdk`**
- Business logic, HTTP endpoints and MCP tool schemas remain aligned with the original
