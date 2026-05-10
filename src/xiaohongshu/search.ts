import type { Page } from 'playwright';
import { logger } from '../logger.js';
import { sleep } from '../util/sleep.js';
import { convertToInternalFilters, type InternalFilter } from './filters.js';
import type { Feed, FilterOption } from './types.js';
import { OS_API_SEARCH_NOTES, OS_CAPTURE_TIMEOUT, OS_SETTLE_WAIT, makeSearchURL } from './urls.js';
import { captureWithActions, navigateAndCapture } from './xhrCapture.js';
import { parseXHRFeedList } from './xhrTypes.js';

export class SearchAction {
  constructor(private page: Page) {
    page.setDefaultTimeout(60_000);
  }

  async search(keyword: string, filters?: FilterOption): Promise<Feed[]> {
    const internal = filters ? convertToInternalFilters(filters) : [];
    const url = makeSearchURL(keyword);
    if (internal.length === 0) {
      const body = await navigateAndCapture(
        this.page,
        url,
        OS_API_SEARCH_NOTES,
        OS_CAPTURE_TIMEOUT,
      );
      return parseXHRFeedList(body);
    }

    logger.debug({ count: internal.length }, 'search applying filter chips');
    const body = await captureWithActions(
      this.page,
      url,
      OS_API_SEARCH_NOTES,
      OS_CAPTURE_TIMEOUT,
      OS_SETTLE_WAIT,
      (p) => applySearchFilters(p, internal),
    );
    return parseXHRFeedList(body);
  }
}

// 在 rednote 搜尋頁 hover 開啟筛選面板，按文字精確點擊（避開 aria-hidden 副本）
async function applySearchFilters(page: Page, filters: InternalFilter[]): Promise<void> {
  const btn = page.locator('div.filter').first();
  await btn.waitFor({ state: 'visible', timeout: 10_000 });
  await btn.hover();
  await page.locator('div.filter-panel').first().waitFor({ state: 'visible', timeout: 10_000 });
  await sleep(300);

  for (const f of filters) {
    const all = page.locator('div.filter-panel div.tags');
    const count = await all.count();
    let clicked = false;
    for (let i = 0; i < count; i++) {
      const el = all.nth(i);
      const ariaHidden = await el.getAttribute('aria-hidden');
      if (ariaHidden === 'true') continue;
      const txt = ((await el.textContent()) ?? '').trim();
      if (txt !== f.text) continue;
      await el.click();
      clicked = true;
      await sleep(500);
      break;
    }
    if (!clicked) throw new Error(`filter chip "${f.text}" not found`);
  }
}
