import type { Page } from 'playwright';
import { logger } from '../logger.js';
import {
  bindProducts,
  clickSubmit,
  fillContentAndTags,
  fillTitle,
  gotoPublishPage,
  setOriginal,
  setSchedulePublish,
  setVisibility,
  uploadImages,
} from './publishCommon.js';

export interface PublishImageContent {
  title: string;
  content: string;
  tags: string[];
  imagePaths: string[];
  scheduleTime?: Date;
  isOriginal?: boolean;
  visibility?: string;
  products?: string[];
}

export class PublishImageAction {
  static async create(page: Page): Promise<PublishImageAction> {
    await gotoPublishPage(page, '上传图文');
    return new PublishImageAction(page);
  }

  private constructor(private page: Page) {}

  async publish(content: PublishImageContent): Promise<void> {
    if (content.imagePaths.length === 0) throw new Error('图片不能为空');
    await uploadImages(this.page, content.imagePaths);

    let tags = content.tags ?? [];
    if (tags.length >= 10) {
      logger.warn('标签数量超过10，截取前10个');
      tags = tags.slice(0, 10);
    }
    logger.info(
      {
        title: content.title,
        images: content.imagePaths.length,
        tags,
        schedule: content.scheduleTime,
        original: content.isOriginal,
        visibility: content.visibility,
        products: content.products,
      },
      'publish image content',
    );

    const titleEl = await fillTitle(this.page, content.title);
    await fillContentAndTags(this.page, titleEl, content.content, tags);

    if (content.scheduleTime) {
      await setSchedulePublish(this.page, content.scheduleTime);
    }
    await setVisibility(this.page, content.visibility);
    if (content.isOriginal) {
      try {
        await setOriginal(this.page);
      } catch (e) {
        logger.warn({ err: (e as Error).message }, '设置原创声明失败，继续发布');
      }
    }
    await bindProducts(this.page, content.products);
    await clickSubmit(this.page);
  }
}
