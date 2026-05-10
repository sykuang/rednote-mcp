import type { Page } from 'playwright';
import { logger } from '../logger.js';
import {
  bindProducts,
  fillContentAndTags,
  fillTitle,
  gotoPublishPage,
  setSchedulePublish,
  setVisibility,
  uploadVideo,
  waitForPublishButtonClickable,
} from './publishCommon.js';

export interface PublishVideoContent {
  title: string;
  content: string;
  tags: string[];
  videoPath: string;
  scheduleTime?: Date;
  visibility?: string;
  products?: string[];
}

export class PublishVideoAction {
  static async create(page: Page): Promise<PublishVideoAction> {
    await gotoPublishPage(page, '上传视频');
    return new PublishVideoAction(page);
  }

  private constructor(private page: Page) {}

  async publish(content: PublishVideoContent): Promise<void> {
    if (!content.videoPath) throw new Error('视频不能为空');
    await uploadVideo(this.page, content.videoPath);

    const titleEl = await fillTitle(this.page, content.title);
    await fillContentAndTags(this.page, titleEl, content.content, content.tags ?? []);

    if (content.scheduleTime) {
      await setSchedulePublish(this.page, content.scheduleTime);
    }
    await setVisibility(this.page, content.visibility);
    await bindProducts(this.page, content.products);

    const btn = await waitForPublishButtonClickable(this.page);
    await btn.click();
    logger.info('已点击发布按钮(视频)');
  }
}
