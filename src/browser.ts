import fs from 'node:fs';
import { chromium, type Browser, type BrowserContext, type LaunchOptions } from 'playwright';
import { config } from './config.js';
import { getCookiesFilePath, loadCookies } from './cookies.js';
import { logger } from './logger.js';

// rednote 用 Playwright 的 BrowserContext 較自然：cookies 注入在 context 層級
export interface RNBrowser {
  browser: Browser;
  context: BrowserContext;
  close: () => Promise<void>;
}

function maskProxy(proxyURL: string): string {
  try {
    const u = new URL(proxyURL);
    if (u.username || u.password) {
      u.username = '***';
      u.password = '***';
    }
    return u.toString();
  } catch {
    return proxyURL;
  }
}

// Playwright cookies 結構（轉換 go-rod / chromium cookies）
interface RodCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
}

function toPlaywrightCookies(raw: Buffer): Parameters<BrowserContext['addCookies']>[0] {
  const arr: RodCookie[] = JSON.parse(raw.toString('utf8'));
  return arr
    .filter((c) => c.name && c.value)
    .map((c) => {
      const ck: Parameters<BrowserContext['addCookies']>[0][number] = {
        name: c.name,
        value: c.value,
        domain: c.domain ?? '.rednote.com',
        path: c.path ?? '/',
        httpOnly: !!c.httpOnly,
        secure: !!c.secure,
      };
      if (typeof c.expires === 'number' && c.expires > 0) ck.expires = c.expires;
      const ss = (c.sameSite ?? '').toLowerCase();
      if (ss === 'lax' || ss === 'strict' || ss === 'none') {
        ck.sameSite = ss === 'lax' ? 'Lax' : ss === 'strict' ? 'Strict' : 'None';
      }
      return ck;
    });
}

export async function newBrowser(): Promise<RNBrowser> {
  const launchOpts: LaunchOptions = {
    headless: config.isHeadless(),
    args: ['--disable-blink-features=AutomationControlled'],
  };
  if (config.getBinPath()) launchOpts.executablePath = config.getBinPath();
  const proxy = process.env.XHS_PROXY;
  if (proxy) {
    launchOpts.proxy = { server: proxy };
    logger.info({ proxy: maskProxy(proxy) }, 'using proxy');
  }

  const browser = await chromium.launch(launchOpts);
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) ' +
      'Chrome/120.0.0.0 Safari/537.36',
  });

  // 載入 cookies
  const cookiePath = getCookiesFilePath();
  if (fs.existsSync(cookiePath)) {
    try {
      const cks = toPlaywrightCookies(loadCookies(cookiePath));
      if (cks.length > 0) {
        await context.addCookies(cks);
        logger.debug({ count: cks.length }, 'cookies loaded');
      }
    } catch (e) {
      logger.warn({ err: (e as Error).message }, 'failed to load cookies');
    }
  }

  return {
    browser,
    context,
    close: async () => {
      try {
        await context.close();
      } catch {
        /* noop */
      }
      await browser.close();
    },
  };
}

// 取得 cookies (序列化儲存)
export async function dumpCookies(context: BrowserContext): Promise<string> {
  const cks = await context.cookies();
  return JSON.stringify(cks);
}
