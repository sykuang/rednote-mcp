# rednote-mcp (Node.js)

[![npm](https://img.shields.io/npm/v/@sykuang/rednote-mcp.svg)](https://www.npmjs.com/package/@sykuang/rednote-mcp)

rednote.com（小紅書海外版 / REDNOTE）MCP server。

本專案為 [xpzouying/xiaohongshu-mcp](https://github.com/xpzouying/xiaohongshu-mcp) 的**海外版（REDNOTE）實作**，改用 Node.js + TypeScript + Playwright，方便使用者透過 `npx` 直接安裝使用，無需自行編譯。

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

### 方式 1：直接用 npx（推薦）

```bash
# stdio 模式 (給 MCP client)
npx -y @sykuang/rednote-mcp --stdio

# HTTP 模式
npx -y @sykuang/rednote-mcp --port :18060

# 查所有選項
npx -y @sykuang/rednote-mcp --help
```

首次執行會自動下載 Chromium（~170MB，一次性）。

#### Claude Desktop / Cursor 設定範例

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

### 方式 2：全域安裝

```bash
npm install -g @sykuang/rednote-mcp
rednote-mcp --stdio
```

### 方式 3：從原始碼

```bash
git clone https://github.com/sykuang/rednote-mcp.git
cd rednote-mcp
npm install
npm run build
node dist/main.js --stdio
```

## 啟動

HTTP 模式（預設 `:18060`）：

```bash
npx @sykuang/rednote-mcp --port :18060
# 或從原始碼: node dist/main.js --port :18060
```

stdio 模式（給 Claude Desktop / Cursor 等 MCP client）：

```bash
npx @sykuang/rednote-mcp --stdio
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

### 使用預編譯 image (GHCR)

```bash
# 直接 docker run
docker run -d --name rednote-mcp \
  -p 18060:18060 \
  -v $(pwd)/cookies.json:/app/cookies.json \
  --shm-size=1g \
  ghcr.io/sykuang/rednote-mcp:latest
```

### docker compose

```bash
# 取得 cookies.json 後 (參考下方登入流程), 直接啟動
docker compose up -d
docker compose logs -f
```

`docker-compose.yml` 已包含：
- 使用 GHCR 預編譯 image (`ghcr.io/sykuang/rednote-mcp:latest`)
- `cookies.json` 持久化 mount
- `shm_size: 1gb`（瀏覽器子程序需要）

### 從原始碼 build

```bash
docker build -t rednote-mcp-node .
docker run -p 18060:18060 -v $(pwd)/cookies.json:/app/cookies.json rednote-mcp-node
```

## 與 Go 版本差異

本專案為 [xpzouying/xiaohongshu-mcp](https://github.com/xpzouying/xiaohongshu-mcp)（小紅書中國站，Go 實作）的**海外版（REDNOTE）port**：

- **目標站點不同**：原版針對 xiaohongshu.com（中國站），本專案針對 rednote.com（海外站）
- **實作語言**：Go → **Node.js / TypeScript**（方便 `npx` 安裝、跨平台無需編譯）
- 用 **Playwright** 取代 go-rod；XHR 攔截改用 `page.on('response')`，比 CDP 更簡單
- HTTP 框架用 **Fastify** 取代 Gin
- MCP 用官方 **`@modelcontextprotocol/sdk`**
- 業務邏輯、API 端點、MCP 工具 schema 與原版完全對齊
