import pino from 'pino';

// stdio 模式下 stdout 是 JSON-RPC 通道，所有 log 必須走 stderr
const isStdio = process.argv.includes('--stdio') || process.env.MCP_STDIO === '1';

export const logger = pino(
  {
    level: process.env.LOG_LEVEL ?? 'info',
  },
  pino.destination({ dest: 2, sync: false }),
);

void isStdio; // 保留語意，stdio/HTTP 一律寫 stderr 較安全
