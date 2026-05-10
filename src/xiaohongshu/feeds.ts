import type { Page } from 'playwright';
import { hostURL } from './host.js';
import { OS_API_HOMEFEED, OS_CAPTURE_TIMEOUT } from './urls.js';
import { navigateAndCapture } from './xhrCapture.js';
import { parseXHRFeedList } from './xhrTypes.js';
import type { Feed } from './types.js';

export class FeedsListAction {
  constructor(private page: Page) {
    page.setDefaultTimeout(60_000);
  }

  async getFeedsList(): Promise<Feed[]> {
    const body = await navigateAndCapture(
      this.page,
      `${hostURL()}/explore`,
      OS_API_HOMEFEED,
      OS_CAPTURE_TIMEOUT,
    );
    return parseXHRFeedList(body);
  }
}
