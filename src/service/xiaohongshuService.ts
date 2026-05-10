// Service 層：每個操作 newBrowser → newPage → action → close
import fs from 'node:fs';
import { newBrowser, dumpCookies } from '../browser.js';
import {
  deleteCookies as deleteCookieFile,
  getCookiesFilePath,
  saveCookies as saveCookieFile,
} from '../cookies.js';
import { logger } from '../logger.js';
import { USERNAME } from '../config.js';
import { calcTitleLength } from '../util/titleLen.js';
import { processImages } from '../util/imageDownloader.js';
import { CommentFeedAction } from '../xiaohongshu/commentFeed.js';
import { FeedDetailAction } from '../xiaohongshu/feedDetail.js';
import { FavoriteAction, LikeAction } from '../xiaohongshu/likeFavorite.js';
import { FeedsListAction } from '../xiaohongshu/feeds.js';
import { LoginAction } from '../xiaohongshu/login.js';
import { PublishImageAction, type PublishImageContent } from '../xiaohongshu/publishImage.js';
import { PublishVideoAction, type PublishVideoContent } from '../xiaohongshu/publishVideo.js';
import { SearchAction } from '../xiaohongshu/search.js';
import {
  defaultCommentLoadConfig,
  type CommentLoadConfig,
  type Feed,
  type FeedDetailResponse,
  type FilterOption,
  type UserProfileResponse,
} from '../xiaohongshu/types.js';
import { UserProfileAction } from '../xiaohongshu/userProfile.js';

export interface PublishRequest {
  title: string;
  content: string;
  images: string[];
  tags?: string[];
  scheduleAt?: string;
  isOriginal?: boolean;
  visibility?: string;
  products?: string[];
}

export interface PublishVideoRequest {
  title: string;
  content: string;
  video: string;
  tags?: string[];
  scheduleAt?: string;
  visibility?: string;
  products?: string[];
}

export interface LoginStatusResponse {
  isLoggedIn: boolean;
  username?: string;
}

export interface LoginQrcodeResponse {
  timeout: string;
  isLoggedIn: boolean;
  img?: string;
}

export interface PublishResponse {
  title: string;
  content: string;
  images: number;
  status: string;
}

export interface PublishVideoResponse {
  title: string;
  content: string;
  video: string;
  status: string;
}

export interface FeedsListResponse {
  feeds: Feed[];
  count: number;
}

export interface FeedDetailServiceResponse {
  feedId: string;
  data: FeedDetailResponse;
}

export interface ActionResult {
  feedId: string;
  success: boolean;
  message: string;
}

export interface ReplyCommentResponse extends ActionResult {
  targetCommentId: string;
  targetUserId: string;
}

async function withPage<T>(fn: (page: import('playwright').Page) => Promise<T>): Promise<T> {
  const b = await newBrowser();
  const page = await b.context.newPage();
  try {
    return await fn(page);
  } finally {
    try {
      await page.close();
    } catch {
      /* ignore */
    }
    await b.close();
  }
}

export class XiaohongshuService {
  async deleteCookies(): Promise<void> {
    deleteCookieFile(getCookiesFilePath());
  }

  async checkLoginStatus(): Promise<LoginStatusResponse> {
    return withPage(async (page) => {
      const ok = await new LoginAction(page).checkLoginStatus();
      return { isLoggedIn: ok, username: USERNAME };
    });
  }

  // 取得登入二維碼；非阻塞背景等待登入並保存 cookies
  async getLoginQrcode(): Promise<LoginQrcodeResponse> {
    const b = await newBrowser();
    const page = await b.context.newPage();
    const cleanup = async () => {
      try {
        await page.close();
      } catch {
        /* ignore */
      }
      await b.close();
    };
    try {
      const login = new LoginAction(page);
      const r = await login.fetchQrcodeImage();
      if (r.loggedIn) {
        await cleanup();
        return { timeout: '0s', isLoggedIn: true };
      }
      const timeoutMs = 4 * 60 * 1000;
      // 背景等待
      void (async () => {
        try {
          if (await login.waitForLogin(timeoutMs)) {
            const data = await dumpCookies(b.context);
            saveCookieFile(getCookiesFilePath(), data);
            logger.info('cookies saved after login');
          }
        } catch (e) {
          logger.error({ err: (e as Error).message }, 'wait login failed');
        } finally {
          await cleanup();
        }
      })();
      return { timeout: '4m0s', isLoggedIn: false, img: r.img };
    } catch (e) {
      await cleanup();
      throw e;
    }
  }

  async publishContent(req: PublishRequest): Promise<PublishResponse> {
    if (calcTitleLength(req.title) > 20) throw new Error('标题长度超过限制');
    const imagePaths = await processImages(req.images);
    const scheduleTime = parseScheduleAt(req.scheduleAt);

    const content: PublishImageContent = {
      title: req.title,
      content: req.content,
      tags: req.tags ?? [],
      imagePaths,
      scheduleTime,
      isOriginal: req.isOriginal,
      visibility: req.visibility,
      products: req.products,
    };
    await withPage(async (page) => {
      const action = await PublishImageAction.create(page);
      await action.publish(content);
    });
    return {
      title: req.title,
      content: req.content,
      images: imagePaths.length,
      status: '发布完成',
    };
  }

  async publishVideo(req: PublishVideoRequest): Promise<PublishVideoResponse> {
    if (calcTitleLength(req.title) > 20) throw new Error('标题长度超过限制');
    if (!req.video) throw new Error('必须提供本地视频文件');
    if (!fs.existsSync(req.video)) throw new Error(`视频文件不存在或不可访问: ${req.video}`);
    const scheduleTime = parseScheduleAt(req.scheduleAt);
    const content: PublishVideoContent = {
      title: req.title,
      content: req.content,
      tags: req.tags ?? [],
      videoPath: req.video,
      scheduleTime,
      visibility: req.visibility,
      products: req.products,
    };
    await withPage(async (page) => {
      const action = await PublishVideoAction.create(page);
      await action.publish(content);
    });
    return { title: req.title, content: req.content, video: req.video, status: '发布完成' };
  }

  async listFeeds(): Promise<FeedsListResponse> {
    return withPage(async (page) => {
      const feeds = await new FeedsListAction(page).getFeedsList();
      return { feeds, count: feeds.length };
    });
  }

  async searchFeeds(keyword: string, filters?: FilterOption): Promise<FeedsListResponse> {
    return withPage(async (page) => {
      const feeds = await new SearchAction(page).search(keyword, filters);
      return { feeds, count: feeds.length };
    });
  }

  async getFeedDetail(
    feedID: string,
    xsecToken: string,
    loadAll: boolean,
    config: CommentLoadConfig = defaultCommentLoadConfig(),
  ): Promise<FeedDetailServiceResponse> {
    return withPage(async (page) => {
      const data = await new FeedDetailAction(page).getFeedDetail(
        feedID,
        xsecToken,
        loadAll,
        config,
      );
      return { feedId: feedID, data };
    });
  }

  async userProfile(userID: string, xsecToken: string): Promise<UserProfileResponse> {
    return withPage((page) => new UserProfileAction(page).userProfile(userID, xsecToken));
  }

  async getMyProfile(): Promise<UserProfileResponse> {
    return withPage((page) => new UserProfileAction(page).getMyProfileViaSidebar());
  }

  async postCommentToFeed(
    feedID: string,
    xsecToken: string,
    content: string,
  ): Promise<ActionResult> {
    await withPage((page) => new CommentFeedAction(page).postComment(feedID, xsecToken, content));
    return { feedId: feedID, success: true, message: '评论发表成功' };
  }

  async replyCommentToFeed(
    feedID: string,
    xsecToken: string,
    commentID: string,
    userID: string,
    content: string,
  ): Promise<ReplyCommentResponse> {
    await withPage((page) =>
      new CommentFeedAction(page).replyToComment(feedID, xsecToken, commentID, userID, content),
    );
    return {
      feedId: feedID,
      targetCommentId: commentID,
      targetUserId: userID,
      success: true,
      message: '评论回复成功',
    };
  }

  async likeFeed(feedID: string, xsecToken: string): Promise<ActionResult> {
    await withPage((page) => new LikeAction(page).like(feedID, xsecToken));
    return { feedId: feedID, success: true, message: '点赞成功或已点赞' };
  }
  async unlikeFeed(feedID: string, xsecToken: string): Promise<ActionResult> {
    await withPage((page) => new LikeAction(page).unlike(feedID, xsecToken));
    return { feedId: feedID, success: true, message: '取消点赞成功或未点赞' };
  }
  async favoriteFeed(feedID: string, xsecToken: string): Promise<ActionResult> {
    await withPage((page) => new FavoriteAction(page).favorite(feedID, xsecToken));
    return { feedId: feedID, success: true, message: '收藏成功或已收藏' };
  }
  async unfavoriteFeed(feedID: string, xsecToken: string): Promise<ActionResult> {
    await withPage((page) => new FavoriteAction(page).unfavorite(feedID, xsecToken));
    return { feedId: feedID, success: true, message: '取消收藏成功或未收藏' };
  }
}

// 解析 ISO8601 並校驗 1h~14d
function parseScheduleAt(raw?: string): Date | undefined {
  if (!raw) return undefined;
  const t = new Date(raw);
  if (isNaN(t.getTime())) throw new Error(`定时发布时间格式错误，请使用 ISO8601 格式: ${raw}`);
  const now = Date.now();
  const min = now + 60 * 60 * 1000;
  const max = now + 14 * 24 * 60 * 60 * 1000;
  if (t.getTime() < min) {
    throw new Error(
      `定时发布时间必须至少在1小时后，当前设置: ${fmt(t)}，最早可选: ${fmt(new Date(min))}`,
    );
  }
  if (t.getTime() > max) {
    throw new Error(
      `定时发布时间不能超过14天，当前设置: ${fmt(t)}，最晚可选: ${fmt(new Date(max))}`,
    );
  }
  logger.info({ schedule: fmt(t) }, '设置定时发布时间');
  return t;
}

function fmt(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
