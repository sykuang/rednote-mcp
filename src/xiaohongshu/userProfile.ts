import type { Page } from 'playwright';
import { logger } from '../logger.js';
import { hostURL } from './host.js';
import type { UserProfileResponse } from './types.js';
import {
  OS_API_OTHERINFO,
  OS_API_SELFINFO,
  OS_API_USER_POSTED,
  OS_CAPTURE_TIMEOUT,
  OS_SETTLE_WAIT,
  makeUserProfileURL,
} from './urls.js';
import { navigateAndCaptureMulti } from './xhrCapture.js';
import { parseXHROtherInfo, parseXHRUserPosted } from './xhrTypes.js';

export class UserProfileAction {
  constructor(private page: Page) {
    page.setDefaultTimeout(60_000);
  }

  async userProfile(userID: string, xsecToken: string): Promise<UserProfileResponse> {
    return this.fetch(userID, xsecToken, OS_API_OTHERINFO);
  }

  // 自己的資料：rednote 個人主頁發 selfinfo（不是 otherinfo）
  async selfProfile(userID: string, xsecToken: string): Promise<UserProfileResponse> {
    return this.fetch(userID, xsecToken, OS_API_SELFINFO);
  }

  private async fetch(
    userID: string,
    xsecToken: string,
    basicAPI: string,
  ): Promise<UserProfileResponse> {
    const url = makeUserProfileURL(userID, xsecToken);
    const res = await navigateAndCaptureMulti(
      this.page,
      url,
      [
        { matchPath: basicAPI, required: true },
        { matchPath: OS_API_USER_POSTED, required: false },
      ],
      OS_SETTLE_WAIT,
      OS_CAPTURE_TIMEOUT,
    );
    const resp = parseXHROtherInfo(res[basicAPI]!);
    const posted = res[OS_API_USER_POSTED];
    if (posted) {
      try {
        resp.feeds = parseXHRUserPosted(posted);
      } catch (e) {
        logger.warn({ err: (e as Error).message }, 'parse user_posted failed');
      }
    }
    return resp;
  }

  // 從 sidebar Me 連結提取自己 userID，再走 selfProfile
  async getMyProfileViaSidebar(): Promise<UserProfileResponse> {
    await this.page.goto(`${hostURL()}/explore`, { waitUntil: 'load', timeout: 60_000 });
    const link = this.page
      .locator('div.main-container li.user.side-bar-component a.link-wrapper')
      .first();
    const href = await link.getAttribute('href', { timeout: 10_000 });
    if (!href) throw new Error('sidebar link missing href');
    const { userID, xsecToken } = parseProfileHref(href);
    if (!userID) throw new Error(`cannot extract userID from href=${href}`);
    return this.selfProfile(userID, xsecToken);
  }
}

function parseProfileHref(href: string): { userID: string; xsecToken: string } {
  try {
    // href 可能是相對 URL，補 base
    const u = href.startsWith('http') ? new URL(href) : new URL(href, hostURL());
    const parts = u.pathname.replace(/^\//, '').split('/');
    let userID = '';
    for (let i = 0; i < parts.length; i++) {
      if (parts[i] === 'profile' && i + 1 < parts.length) {
        userID = parts[i + 1]!;
        break;
      }
    }
    return { userID, xsecToken: u.searchParams.get('xsec_token') ?? '' };
  } catch {
    return { userID: '', xsecToken: '' };
  }
}
