import type { Page } from 'playwright';
import { logger } from '../logger.js';
import { sleep } from '../util/sleep.js';
import type { CommentLoadConfig, FeedDetailResponse } from './types.js';
import {
  OS_API_COMMENTS,
  OS_API_FEED,
  OS_CAPTURE_TIMEOUT,
  OS_SETTLE_WAIT,
  makeFeedDetailURL,
} from './urls.js';
import { navigateAndCaptureMulti } from './xhrCapture.js';
import { parseXHRComments, parseXHRFeedDetail } from './xhrTypes.js';

export class FeedDetailAction {
  constructor(private page: Page) {}

  async getFeedDetail(
    feedID: string,
    xsecToken: string,
    loadAllComments: boolean,
    _config: CommentLoadConfig,
  ): Promise<FeedDetailResponse> {
    if (loadAllComments) {
      logger.warn('loadAllComments paging not supported on rednote, returning first page only');
    }
    const url = makeFeedDetailURL(feedID, xsecToken);
    logger.debug({ url }, 'feed detail navigate');
    const res = await navigateAndCaptureMulti(
      this.page,
      url,
      [
        { matchPath: OS_API_FEED, required: true },
        { matchPath: OS_API_COMMENTS, required: false },
      ],
      OS_SETTLE_WAIT,
      OS_CAPTURE_TIMEOUT,
    );
    const resp = parseXHRFeedDetail(res[OS_API_FEED]!, feedID, xsecToken);
    const cmtBody = res[OS_API_COMMENTS];
    if (cmtBody) {
      try {
        resp.comments = parseXHRComments(cmtBody);
      } catch (e) {
        logger.warn({ err: (e as Error).message }, 'parse comments failed');
      }
    }
    return resp;
  }
}

// ====== 評論區滾動輔助（commentFeed.ts 用） ======

export async function scrollToCommentsArea(page: Page): Promise<void> {
  logger.info('scrollToCommentsArea');
  const el = await page.$('.comments-container');
  if (el) await el.scrollIntoViewIfNeeded();
  await sleep(500);
  await smartScroll(page, 100);
}

export async function smartScroll(page: Page, delta: number): Promise<void> {
  await page.evaluate((d: number) => {
    const target =
      document.querySelector('.note-scroller') ||
      document.querySelector('.interaction-container') ||
      document.documentElement;
    const ev = new WheelEvent('wheel', {
      deltaY: d,
      deltaMode: 0,
      bubbles: true,
      cancelable: true,
      view: window,
    });
    target.dispatchEvent(ev);
  }, delta);
}

export async function getCommentCount(page: Page): Promise<number> {
  return page.locator('.parent-comment').count();
}

export async function checkEndContainer(page: Page): Promise<boolean> {
  const el = await page.$('.end-container');
  if (!el) return false;
  const text = ((await el.textContent()) ?? '').trim().toUpperCase();
  return text.includes('THE END') || text.includes('THEEND');
}

export async function checkPageAccessible(page: Page): Promise<void> {
  await sleep(500);
  const el = await page.$('.access-wrapper, .error-wrapper, .not-found-wrapper, .blocked-wrapper');
  if (!el) return;
  const text = (await el.textContent()) ?? '';
  const keywords = [
    '当前笔记暂时无法浏览',
    '该内容因违规已被删除',
    '该笔记已被删除',
    '内容不存在',
    '笔记不存在',
    '已失效',
    '私密笔记',
    '仅作者可见',
    '因用户设置，你无法查看',
    '因违规无法查看',
  ];
  for (const kw of keywords) {
    if (text.includes(kw)) {
      logger.warn({ reason: kw }, 'note not accessible');
      throw new Error(`note not accessible: ${kw}`);
    }
  }
  const trimmed = text.trim();
  if (trimmed) {
    logger.warn({ text: trimmed }, 'note not accessible (unknown)');
    throw new Error(`note not accessible: ${trimmed}`);
  }
}
