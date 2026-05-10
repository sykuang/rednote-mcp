import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// cookies 檔案路徑：相容舊路徑 /tmp/cookies.json，再看環境變數 COOKIES_PATH，最後 fallback ./cookies.json
export function getCookiesFilePath(): string {
  const oldPath = path.join(os.tmpdir(), 'cookies.json');
  if (fs.existsSync(oldPath)) return oldPath;
  return process.env.COOKIES_PATH || 'cookies.json';
}

export function loadCookies(filePath: string): Buffer {
  return fs.readFileSync(filePath);
}

export function saveCookies(filePath: string, data: Buffer | string): void {
  fs.writeFileSync(filePath, data);
}

export function deleteCookies(filePath: string): void {
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}
