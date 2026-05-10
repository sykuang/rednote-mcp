import type { Page, Response } from 'playwright';
import { logger } from '../logger.js';

// rednote XHR 攔截：對應 Go xhiaohongshu/api_capture.go
// Playwright 直接 page.on('response') 即可，省去 CDP RequestID 管理

export interface CaptureSpec {
  matchPath: string;
  required: boolean;
}

export type CaptureResult = Record<string, string>;

// pathMatch: url 中包含 path，且 path 後立即是末尾或 ? #
function pathMatch(url: string, p: string): boolean {
  const idx = url.indexOf(p);
  if (idx < 0) return false;
  const after = url.slice(idx + p.length);
  return after === '' || after[0] === '?' || after[0] === '#';
}

function isXHR(res: Response): boolean {
  const t = res.request().resourceType();
  return t === 'xhr' || t === 'fetch';
}

// navigateAndCaptureMulti: 在導航前掛 listener，同時等多個目標 XHR；
// 命中所有 required 後再等 settleWait 收尾。
export async function navigateAndCaptureMulti(
  page: Page,
  navURL: string,
  specs: CaptureSpec[],
  settleWait: number,
  totalTimeout: number,
): Promise<CaptureResult> {
  if (specs.length === 0) throw new Error('no capture specs');

  const result: CaptureResult = {};
  const fired = new Set<string>();
  const requiredCount = specs.filter((s) => s.required).length;
  let gotRequired = 0;

  let resolveSettle: () => void;
  let rejectSettle: (e: Error) => void;
  const done = new Promise<void>((res, rej) => {
    resolveSettle = res;
    rejectSettle = rej;
  });

  let settleTimer: NodeJS.Timeout | undefined;
  let switched = false;
  const totalTimer = setTimeout(() => {
    rejectSettle(new Error('navigateAndCapture totalTimeout'));
  }, totalTimeout);

  const handler = async (res: Response) => {
    try {
      if (!isXHR(res)) return;
      const url = res.url();
      const matched = specs.find((s) => pathMatch(url, s.matchPath));
      if (!matched) return;
      if (fired.has(matched.matchPath)) return;
      fired.add(matched.matchPath);
      let body: string;
      try {
        body = await res.text();
      } catch (e) {
        logger.debug({ err: (e as Error).message, url }, 'capture body failed');
        return;
      }
      result[matched.matchPath] = body;
      if (matched.required) {
        gotRequired++;
        if (!switched && gotRequired >= requiredCount) {
          switched = true;
          if (settleTimer) clearTimeout(settleTimer);
          settleTimer = setTimeout(() => resolveSettle(), settleWait);
        }
      }
    } catch (e) {
      logger.debug({ err: (e as Error).message }, 'capture handler error');
    }
  };

  page.on('response', handler);

  try {
    // 不等 navigation 完成，背景觸發
    page.goto(navURL, { waitUntil: 'commit' }).catch(() => {
      /* ignore nav errors; we rely on XHR capture */
    });
    await done;
  } finally {
    clearTimeout(totalTimer);
    if (settleTimer) clearTimeout(settleTimer);
    page.off('response', handler);
  }

  for (const s of specs) {
    if (s.required && !(s.matchPath in result)) {
      throw new Error(`required api not captured: ${s.matchPath}`);
    }
  }
  return result;
}

export async function navigateAndCapture(
  page: Page,
  navURL: string,
  apiPath: string,
  totalTimeout: number,
): Promise<string> {
  const r = await navigateAndCaptureMulti(
    page,
    navURL,
    [{ matchPath: apiPath, required: true }],
    200,
    totalTimeout,
  );
  return r[apiPath]!;
}

// captureWithActions: 導航後等首次響應，再執行 actions，期間最後一次響應為結果
export async function captureWithActions(
  page: Page,
  navURL: string,
  apiPath: string,
  totalTimeout: number,
  settleWait: number,
  actions: (page: Page) => Promise<void>,
): Promise<string> {
  let latestBody = '';
  let gotAny = false;
  let actionDoneFlag = false;
  let settleTimer: NodeJS.Timeout | undefined;

  let resolveDone: (body: string) => void;
  let rejectDone: (e: Error) => void;
  const done = new Promise<string>((res, rej) => {
    resolveDone = res;
    rejectDone = rej;
  });

  const totalTimer = setTimeout(
    () => rejectDone(new Error('captureWithActions timeout')),
    totalTimeout,
  );

  const handler = async (res: Response) => {
    try {
      if (!isXHR(res)) return;
      if (!pathMatch(res.url(), apiPath)) return;
      let body: string;
      try {
        body = await res.text();
      } catch {
        return;
      }
      latestBody = body;
      gotAny = true;
      if (actionDoneFlag) {
        if (settleTimer) clearTimeout(settleTimer);
        settleTimer = setTimeout(() => resolveDone(latestBody), settleWait);
      }
    } catch (e) {
      logger.debug({ err: (e as Error).message }, 'capture handler error');
    }
  };
  page.on('response', handler);

  try {
    page.goto(navURL, { waitUntil: 'commit' }).catch(() => {
      /* ignore */
    });

    // 等首次響應
    const firstWait = new Promise<void>((res) => {
      const check = setInterval(() => {
        if (gotAny) {
          clearInterval(check);
          res();
        }
      }, 50);
    });
    await Promise.race([
      firstWait,
      new Promise((_, rej) =>
        setTimeout(() => rej(new Error('initial response timeout')), totalTimeout),
      ),
    ]);

    // 執行 actions
    await actions(page);
    actionDoneFlag = true;
    // actions 完成後再等 settleWait（如果無新響應就直接以 latestBody 收尾）
    settleTimer = setTimeout(() => resolveDone(latestBody), settleWait);

    return await done;
  } finally {
    clearTimeout(totalTimer);
    if (settleTimer) clearTimeout(settleTimer);
    page.off('response', handler);
  }
}

// captureMultiWithActions: 在執行 actions 期間監聽多個 path
export async function captureMultiWithActions(
  page: Page,
  specs: CaptureSpec[],
  settleWait: number,
  totalTimeout: number,
  actions: (page: Page) => Promise<void>,
): Promise<CaptureResult> {
  if (specs.length === 0) throw new Error('no capture specs');

  const result: CaptureResult = {};
  const fired = new Set<string>();
  const requiredCount = specs.filter((s) => s.required).length;
  let gotRequired = 0;
  let switched = false;

  let resolveDone: () => void;
  let rejectDone: (e: Error) => void;
  const done = new Promise<void>((res, rej) => {
    resolveDone = res;
    rejectDone = rej;
  });
  let settleTimer: NodeJS.Timeout | undefined;
  const totalTimer = setTimeout(
    () => rejectDone(new Error('captureMultiWithActions timeout')),
    totalTimeout,
  );

  const handler = async (res: Response) => {
    try {
      if (!isXHR(res)) return;
      const url = res.url();
      const matched = specs.find((s) => pathMatch(url, s.matchPath));
      if (!matched || fired.has(matched.matchPath)) return;
      fired.add(matched.matchPath);
      let body: string;
      try {
        body = await res.text();
      } catch {
        return;
      }
      result[matched.matchPath] = body;
      if (matched.required) {
        gotRequired++;
        if (!switched && gotRequired >= requiredCount) {
          switched = true;
          if (settleTimer) clearTimeout(settleTimer);
          settleTimer = setTimeout(() => resolveDone(), settleWait);
        }
      }
    } catch (e) {
      logger.debug({ err: (e as Error).message }, 'capture handler error');
    }
  };
  page.on('response', handler);

  try {
    await actions(page);
    if (!switched) {
      // actions 完成後再等一段時間
      settleTimer = setTimeout(() => resolveDone(), settleWait);
    }
    await done;
  } finally {
    clearTimeout(totalTimer);
    if (settleTimer) clearTimeout(settleTimer);
    page.off('response', handler);
  }

  for (const s of specs) {
    if (s.required && !(s.matchPath in result)) {
      throw new Error(`required api not captured: ${s.matchPath}`);
    }
  }
  return result;
}
