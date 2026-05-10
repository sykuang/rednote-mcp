#!/usr/bin/env node
// 入口: 解析 CLI flags 與 env, 啟動 stdio 或 HTTP server
import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { config } from './config.js';
import { logger } from './logger.js';
import { buildHttpServer } from './server/httpServer.js';
import { buildMcpServer } from './server/mcpServer.js';
import { XiaohongshuService } from './service/xiaohongshuService.js';

const HELP = `rednote-mcp - rednote.com (xiaohongshu) MCP server

USAGE
  rednote-mcp [options]

OPTIONS
  --stdio              以 stdio transport 啟動 MCP server (Claude Desktop / Cursor 用)
  --port :18060        HTTP server 監聽位址 (預設 :18060)
  --headless true      headless 模式 (預設 true，設 false 顯示瀏覽器視窗)
  --bin /path/chrome   指定瀏覽器執行檔 (可選，預設使用 Playwright 內建 Chromium)
  -h, --help           顯示此說明
  -v, --version        顯示版本

ENV
  MCP_STDIO=1          等同 --stdio
  ROD_BROWSER_BIN      等同 --bin
  COOKIES_PATH         cookies.json 路徑 (預設 ./cookies.json)
  XHS_PROXY            HTTP proxy URL

範例
  rednote-mcp --stdio
  rednote-mcp --port :8080 --headless false
`;

function readVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8'));
    return pkg.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

interface CliOptions {
  headless: boolean;
  bin: string;
  port: string;
  stdio: boolean;
}

function parseFlags(): CliOptions {
  const { values } = parseArgs({
    options: {
      headless: { type: 'string', default: 'true' },
      bin: { type: 'string', default: '' },
      port: { type: 'string', default: ':18060' },
      stdio: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
      version: { type: 'boolean', short: 'v', default: false },
    },
    strict: false,
  });
  if (values.help) {
    process.stdout.write(HELP);
    process.exit(0);
  }
  if (values.version) {
    process.stdout.write(readVersion() + '\n');
    process.exit(0);
  }
  return {
    headless: String(values.headless) !== 'false',
    bin: String(values.bin ?? ''),
    port: String(values.port ?? ':18060'),
    stdio: !!values.stdio,
  };
}

async function main(): Promise<void> {
  const opts = parseFlags();
  const stdio = opts.stdio || process.env.MCP_STDIO === '1';
  const binPath = opts.bin || process.env.ROD_BROWSER_BIN || '';

  config.setHeadless(opts.headless);
  config.setBinPath(binPath);

  const svc = new XiaohongshuService();
  const mcp = buildMcpServer(svc);

  if (stdio) {
    logger.info('Starting MCP server over stdio transport');
    const transport = new StdioServerTransport();
    await mcp.connect(transport);
    // 永久運行直到 stdin 關閉
    return;
  }

  const app = buildHttpServer(svc, mcp);
  // port 形如 ":18060" 或 "0.0.0.0:18060"
  const portStr = opts.port.replace(/^:/, '');
  const [host, p] = portStr.includes(':') ? portStr.split(':') : ['0.0.0.0', portStr];
  const portNum = Number(p);
  await app.listen({ host: host || '0.0.0.0', port: portNum });
  logger.info({ port: portNum, host }, '启动 HTTP 服务器');

  const shutdown = async () => {
    logger.info('正在关闭服务器...');
    try {
      await app.close();
      logger.info('服务器已优雅关闭');
    } catch (e) {
      logger.warn({ err: (e as Error).message }, '关闭异常');
    }
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((e) => {
  logger.error({ err: (e as Error).stack ?? (e as Error).message }, 'fatal');
  process.exit(1);
});
