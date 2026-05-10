import type { Locator, Page } from 'playwright';
import { logger } from '../logger.js';
import { sleep } from '../util/sleep.js';
import {
  checkPageAccessible,
  getCommentCount,
  scrollToCommentsArea,
  checkEndContainer,
} from './feedDetail.js';
import { makeFeedDetailURL } from './urls.js';

export class CommentFeedAction {
  constructor(private page: Page) {}

  async postComment(feedID: string, xsecToken: string, content: string): Promise<void> {
    this.page.setDefaultTimeout(60_000);
    const url = makeFeedDetailURL(feedID, xsecToken);
    logger.info({ url }, 'open feed detail to comment');
    await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    try {
      await this.page.waitForLoadState('networkidle', { timeout: 10_000 });
    } catch {
      /* ignore */
    }
    await sleep(1000);

    await checkPageAccessible(this.page);

    const inputBox = this.page.locator('div.input-box div.content-edit span').first();
    if ((await inputBox.count()) === 0) {
      throw new Error('未找到评论输入框，该帖子可能不支持评论或网页端不可访问');
    }
    await inputBox.click();

    const inputField = this.page.locator('div.input-box div.content-edit p.content-input').first();
    await inputField.waitFor({ timeout: 10_000 });
    await inputField.type(content);
    await sleep(1000);

    const submit = this.page.locator('div.bottom button.submit').first();
    await submit.click();
    await sleep(1000);
    logger.info({ feedID }, 'comment posted');
  }

  async replyToComment(
    feedID: string,
    xsecToken: string,
    commentID: string,
    userID: string,
    content: string,
  ): Promise<void> {
    this.page.setDefaultTimeout(5 * 60_000);
    const url = makeFeedDetailURL(feedID, xsecToken);
    logger.info({ url }, 'open feed detail to reply');
    await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    try {
      await this.page.waitForLoadState('networkidle', { timeout: 10_000 });
    } catch {
      /* ignore */
    }
    await sleep(1000);

    await checkPageAccessible(this.page);
    await sleep(2000);

    const commentEl = await findCommentElement(this.page, commentID, userID);
    if (!commentEl) throw new Error(`无法找到评论 commentID=${commentID} userID=${userID}`);
    await commentEl.scrollIntoViewIfNeeded();
    await sleep(1000);

    const replyBtn = commentEl.locator('.right .interactions .reply').first();
    await replyBtn.click();
    await sleep(1000);

    const inputEl = this.page.locator('div.input-box div.content-edit p.content-input').first();
    await inputEl.waitFor({ timeout: 10_000 });
    await inputEl.type(content);
    await sleep(500);

    const submit = this.page.locator('div.bottom button.submit').first();
    await submit.click();
    await sleep(2000);
    logger.info({ feedID, commentID, userID }, 'reply posted');
  }
}

// 滾動查找指定評論
async function findCommentElement(
  page: Page,
  commentID: string,
  userID: string,
): Promise<Locator | null> {
  logger.info({ commentID, userID }, 'find comment element start');
  const maxAttempts = 100;
  const scrollInterval = 800;

  await scrollToCommentsArea(page);
  await sleep(1000);

  let lastCount = 0;
  let stagnant = 0;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (await checkEndContainer(page)) {
      logger.info('reached end-container, target not found');
      break;
    }
    const cur = await getCommentCount(page);
    if (cur !== lastCount) {
      lastCount = cur;
      stagnant = 0;
    } else {
      stagnant++;
    }
    if (stagnant >= 10) {
      logger.info('comment count stagnant, stop');
      break;
    }

    if (cur > 0) {
      const items = page.locator('.parent-comment, .comment-item, .comment');
      const total = await items.count();
      if (total > 0) {
        try {
          await items.nth(total - 1).scrollIntoViewIfNeeded({ timeout: 2000 });
        } catch {
          /* ignore */
        }
      }
      await sleep(300);
    }

    await page.evaluate(() => {
      window.scrollBy(0, window.innerHeight * 0.8);
    });
    await sleep(500);

    if (commentID) {
      const sel = `#comment-${commentID}`;
      const el = page.locator(sel).first();
      if ((await el.count()) > 0) {
        logger.info({ commentID, attempt: attempt + 1 }, 'found by commentID');
        return el;
      }
    }
    if (userID) {
      const items = page.locator('.comment-item, .comment, .parent-comment');
      const total = await items.count();
      for (let i = 0; i < total; i++) {
        const it = items.nth(i);
        const sub = it.locator(`[data-user-id="${userID}"]`).first();
        if ((await sub.count()) > 0) {
          logger.info({ userID, idx: i + 1, attempt: attempt + 1 }, 'found by userID');
          return it;
        }
      }
    }

    await sleep(scrollInterval);
  }
  return null;
}
