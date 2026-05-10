# rednote-mcp (Node.js)

rednote.com（小红书海外站）MCP server，TypeScript + Playwright 實作。
這是 [`rednote-mcp` Go 版本](../rednote-mcp-go) 的 Node.js port，功能對齊。

## 功能

提供 13 個 MCP 工具：

| Tool | 說明 |
|------|------|
| `check_login_status` | 檢查登入狀態 |
| `get_login_qrcode` | 取得登入二維碼 |
| `delete_cookies` | 刪除 cookies 重置登入 |
| `list_feeds` | 取得首頁 feeds |
| `search_feeds` | 搜尋筆記（含篩選） |
| `get_feed_detail` | 取得筆記詳情 + 評論 |
| `user_profile` | 取得用戶主頁 |
| `post_comment_to_feed` | 發表評論 |
| `reply_comment_in_feed` | 回覆評論 |
| `like_feed` / `favorite_feed` | 點讚 / 收藏 |
| `publish_content` | 發佈圖文 |
| `publish_with_video` | 發佈視頻 |

同時提供 HTTP API（`/api/v1/*`）與 MCP Streamable HTTP（`/mcp`）。

## 安裝

```bash
npm install
npx playwright install chromium
npm run build
```

## 啟動

HTTP 模式（預設 `:18060`）：

```bash
node dist/main.js --port :18060
```

stdio 模式（給 Claude Desktop / Cursor 等 MCP client）：

```bash
node dist/main.js --stdio
# 或
MCP_STDIO=1 node dist/main.js
```

CLI flags：
- `--headless` true/false（預設 true）
- `--bin /path/to/chromium`（也可用 `ROD_BROWSER_BIN` env）
- `--port :18060`
- `--stdio`

環境變數：
- `MCP_STDIO=1` 啟用 stdio
- `ROD_BROWSER_BIN` 指定 Chromium 路徑
- `COOKIES_PATH` 指定 cookies 檔路徑（預設先看 `/tmp/cookies.json`，否則 `./cookies.json`）
- `XHS_PROXY` HTTP/HTTPS 代理

## 開發

```bash
npm run dev          # tsx 直接跑
npm run build        # 編譯到 dist/
npm run format       # prettier
npm run lint         # tsc --noEmit
```

## Docker

```bash
docker build -t rednote-mcp-node .
docker run -p 18060:18060 -v /tmp:/tmp rednote-mcp-node
```

## 與 Go 版本差異

- 用 Playwright 取代 go-rod；XHR 攔截改用 `page.on('response')`，比 CDP 更簡單。
- HTTP 框架用 Fastify 取代 Gin。
- MCP 用官方 `@modelcontextprotocol/sdk`。
- 業務邏輯、API 端點、MCP 工具 schema 與 Go 版本完全對齊。
