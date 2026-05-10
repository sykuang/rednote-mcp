// 點讚/收藏：對應 Go xiaohongshu/like_favorite.go
// 透過 __INITIAL_STATE__ 讀目前狀態，避免重複點擊
import type { Page } from 'playwright';
import { logger } from '../logger.js';
import { sleep } from '../util/sleep.js';
import { makeFeedDetailURL } from './urls.js';

const SEL_LIKE = '.interact-container .left .like-lottie';
const SEL_COLLECT = '.interact-container .left .reds-icon.collect-icon';

class InteractAction {
  constructor(protected page: Page) {}

  protected async preparePage(feedID: string, xsecToken: string, label: string): Promise<void> {
    const url = makeFeedDetailURL(feedID, xsecToken);
    logger.info({ url, label }, 'open feed detail page');
    await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    try {
      await this.page.waitForLoadState('networkidle', { timeout: 10_000 });
    } catch {
      /* ignore */
    }
    await sleep(1000);
  }

  // 從 __INITIAL_STATE__.note.noteDetailMap 讀取
  protected async getInteractState(
    feedID: string,
  ): Promise<{ liked: boolean; collected: boolean }> {
    const json = await this.page.evaluate(() => {
      const w = window as unknown as {
        __INITIAL_STATE__?: { note?: { noteDetailMap?: unknown } };
      };
      if (w.__INITIAL_STATE__?.note?.noteDetailMap) {
        return JSON.stringify(w.__INITIAL_STATE__.note.noteDetailMap);
      }
      return '';
    });
    if (!json) throw new Error('ErrNoFeedDetail');
    const map = JSON.parse(json) as Record<
      string,
      { note?: { interactInfo?: { liked?: boolean; collected?: boolean } } }
    >;
    const detail = map[feedID];
    if (!detail) throw new Error(`feed ${feedID} not in noteDetailMap`);
    return {
      liked: !!detail.note?.interactInfo?.liked,
      collected: !!detail.note?.interactInfo?.collected,
    };
  }

  protected async clickSel(sel: string): Promise<void> {
    await this.page.locator(sel).first().click({ timeout: 10_000 });
  }
}

export class LikeAction extends InteractAction {
  async like(feedID: string, xsecToken: string): Promise<void> {
    await this.toggle(feedID, xsecToken, true);
  }
  async unlike(feedID: string, xsecToken: string): Promise<void> {
    await this.toggle(feedID, xsecToken, false);
  }

  private async toggle(feedID: string, xsecToken: string, target: boolean): Promise<void> {
    const action = target ? '点赞' : '取消点赞';
    await this.preparePage(feedID, xsecToken, action);

    let state: { liked: boolean; collected: boolean } | undefined;
    try {
      state = await this.getInteractState(feedID);
    } catch (e) {
      logger.warn({ err: (e as Error).message }, 'read interact state failed (continue)');
    }
    if (state) {
      if (target && state.liked) {
        logger.info({ feedID }, 'already liked, skip');
        return;
      }
      if (!target && !state.liked) {
        logger.info({ feedID }, 'not liked yet, skip');
        return;
      }
    }
    await this.doToggle(feedID, target, action);
  }

  private async doToggle(feedID: string, target: boolean, action: string): Promise<void> {
    await this.clickSel(SEL_LIKE);
    await sleep(3000);
    try {
      const s = await this.getInteractState(feedID);
      if (s.liked === target) {
        logger.info({ feedID }, `${action} success`);
        return;
      }
    } catch {
      /* ignore */
    }
    logger.warn({ feedID }, `${action} state not changed, retry`);
    await this.clickSel(SEL_LIKE);
    await sleep(2000);
  }
}

export class FavoriteAction extends InteractAction {
  async favorite(feedID: string, xsecToken: string): Promise<void> {
    await this.toggle(feedID, xsecToken, true);
  }
  async unfavorite(feedID: string, xsecToken: string): Promise<void> {
    await this.toggle(feedID, xsecToken, false);
  }

  private async toggle(feedID: string, xsecToken: string, target: boolean): Promise<void> {
    const action = target ? '收藏' : '取消收藏';
    await this.preparePage(feedID, xsecToken, action);
    let state: { liked: boolean; collected: boolean } | undefined;
    try {
      state = await this.getInteractState(feedID);
    } catch (e) {
      logger.warn({ err: (e as Error).message }, 'read interact state failed (continue)');
    }
    if (state) {
      if (target && state.collected) {
        logger.info({ feedID }, 'already favorited, skip');
        return;
      }
      if (!target && !state.collected) {
        logger.info({ feedID }, 'not favorited yet, skip');
        return;
      }
    }
    await this.doToggle(feedID, target, action);
  }

  private async doToggle(feedID: string, target: boolean, action: string): Promise<void> {
    await this.clickSel(SEL_COLLECT);
    await sleep(3000);
    try {
      const s = await this.getInteractState(feedID);
      if (s.collected === target) {
        logger.info({ feedID }, `${action} success`);
        return;
      }
    } catch {
      /* ignore */
    }
    logger.warn({ feedID }, `${action} state not changed, retry`);
    await this.clickSel(SEL_COLLECT);
    await sleep(2000);
  }
}
