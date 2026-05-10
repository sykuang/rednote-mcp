import type { Page } from 'playwright';
import { hostURL } from './host.js';
import { sleep } from '../util/sleep.js';

const LOGIN_OK_SEL = '.main-container .user .link-wrapper .channel';

export class LoginAction {
  constructor(private page: Page) {}

  async checkLoginStatus(): Promise<boolean> {
    await this.page.goto(`${hostURL()}/explore`, { waitUntil: 'load', timeout: 60_000 });
    await sleep(1000);
    return (await this.page.$(LOGIN_OK_SEL)) !== null;
  }

  // 從 sidebar 「Me」 連結抓出當前登入者的 userID（海外版 DOM 不含暱稱，僅顯示 i18n "Me"）
  async getMyUserID(): Promise<string> {
    try {
      const href = await this.page
        .locator('div.main-container li.user.side-bar-component a.link-wrapper')
        .first()
        .getAttribute('href', { timeout: 5_000 });
      if (!href) return '';
      const m = href.match(/\/user\/profile\/([^/?#]+)/);
      return m?.[1] ?? '';
    } catch {
      return '';
    }
  }

  // 取得二維碼。回傳 [imgSrc, alreadyLoggedIn]
  async fetchQrcodeImage(): Promise<{ img: string; loggedIn: boolean }> {
    await this.page.goto(`${hostURL()}/explore`, { waitUntil: 'load', timeout: 60_000 });
    await sleep(2000);
    if (await this.page.$(LOGIN_OK_SEL)) return { img: '', loggedIn: true };

    const qr = await this.page.locator('.login-container .qrcode-img').first();
    const src = await qr.getAttribute('src', { timeout: 30_000 });
    if (!src) throw new Error('qrcode src is empty');
    return { img: src, loggedIn: false };
  }

  // 輪詢直到登入成功，timeout 過期回傳 false
  async waitForLogin(timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await this.page.$(LOGIN_OK_SEL)) return true;
      await sleep(500);
    }
    return false;
  }
}
