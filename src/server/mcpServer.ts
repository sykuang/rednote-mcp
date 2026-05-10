// MCP Server：13 工具註冊（對應 Go mcp_handlers.go + mcp_server.go）
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { logger } from '../logger.js';
import { getCookiesFilePath } from '../cookies.js';
import { defaultCommentLoadConfig } from '../xiaohongshu/types.js';
import type { XiaohongshuService } from '../service/xiaohongshuService.js';

type Content = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string };

interface ToolResult {
  content: Content[];
  isError?: boolean;
}

function textErr(text: string): ToolResult {
  return { content: [{ type: 'text', text }], isError: true };
}
function textOK(text: string): ToolResult {
  return { content: [{ type: 'text', text }] };
}
function jsonOK(obj: unknown): ToolResult {
  return textOK(JSON.stringify(obj, null, 2));
}

function wrap<TArgs>(name: string, handler: (a: TArgs) => Promise<ToolResult>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (async (args: TArgs, _extra?: unknown): Promise<ToolResult> => {
    try {
      return await handler(args);
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      logger.error({ tool: name, err: msg }, 'tool handler error');
      return textErr(`工具 ${name} 执行错误: ${msg}`);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
}

export function buildMcpServer(svc: XiaohongshuService): McpServer {
  const server = new McpServer({ name: 'rednote-mcp', version: '2.0.0' });

  server.registerTool(
    'check_login_status',
    {
      title: 'Check Login Status',
      description:
        '检查小红书登录状态。返回 isLoggedIn；若 false，请先调用 get_login_qrcode 让用户扫码登录，再重试操作。建议在调用 search/list_feeds/publish/comment/like/favorite 等需要登录的工具前先呼叫此工具。',
      inputSchema: {},
    },
    wrap('check_login_status', async () => {
      const r = await svc.checkLoginStatus();
      return r.isLoggedIn
        ? textOK(`✅ 已登录\n用户名: ${r.username ?? ''}\n\n你可以使用其他功能了。`)
        : textOK('❌ 未登录\n\n请使用 get_login_qrcode 工具获取二维码进行登录。');
    }),
  );

  server.registerTool(
    'get_login_qrcode',
    {
      title: 'Get Login QR Code',
      description:
        '获取小红书登录二维码（Base64 PNG + 超时秒数）。当 check_login_status 返回 isLoggedIn:false 时调用：把图片直接展示给用户扫码登录；扫码完成后 cookies 会自动保存，再重试原本的操作。',
      inputSchema: {},
    },
    wrap('get_login_qrcode', async () => {
      const r = await svc.getLoginQrcode();
      if (r.isLoggedIn) return textOK('你当前已处于登录状态');
      const deadline = new Date(Date.now() + 4 * 60 * 1000)
        .toISOString()
        .replace('T', ' ')
        .slice(0, 19);
      return {
        content: [
          { type: 'text', text: `请用小红书 App 在 ${deadline} 前扫码登录 👇` },
          {
            type: 'image',
            mimeType: 'image/png',
            data: (r.img ?? '').replace(/^data:image\/png;base64,/, ''),
          },
        ],
      };
    }),
  );

  server.registerTool(
    'delete_cookies',
    {
      title: 'Delete Cookies',
      description: '删除 cookies 文件，重置登录状态。删除后需要重新登录。',
      inputSchema: {},
    },
    wrap('delete_cookies', async () => {
      await svc.deleteCookies();
      const p = getCookiesFilePath();
      return textOK(
        `Cookies 已成功删除，登录状态已重置。\n\n删除的文件路径: ${p}\n\n下次操作时，需要重新登录。`,
      );
    }),
  );

  const PublishContentArgs = {
    title: z.string().describe('Note title (rednote limit: max 20 Chinese chars or English words)'),
    content: z
      .string()
      .describe(
        "Body text. Do NOT include hashtags starting with '#'; pass all hashtags via the tags parameter instead",
      ),
    images: z.array(z.string()).describe('List of image paths (HTTP URL or local absolute path)'),
    tags: z.array(z.string()).optional().describe('Optional list of hashtags'),
    schedule_at: z.string().optional().describe('Optional ISO8601 scheduled publish time (1h~14d)'),
    is_original: z.boolean().optional().describe('Declare original work'),
    visibility: z.string().optional().describe('公开可见 / 仅自己可见 / 仅互关好友可见'),
    products: z.array(z.string()).optional().describe('Optional product keywords for affiliate'),
  };
  server.registerTool(
    'publish_content',
    {
      title: 'Publish Content',
      description: '发布小红书图文内容',
      inputSchema: PublishContentArgs,
    },
    wrap('publish_content', async (a: z.infer<z.ZodObject<typeof PublishContentArgs>>) => {
      const r = await svc.publishContent({
        title: a.title,
        content: a.content,
        images: a.images,
        tags: a.tags,
        scheduleAt: a.schedule_at,
        isOriginal: a.is_original,
        visibility: a.visibility,
        products: a.products,
      });
      return jsonOK(r);
    }),
  );

  const PublishVideoArgs = {
    title: z.string(),
    content: z.string(),
    video: z.string().describe('Local absolute path to video'),
    tags: z.array(z.string()).optional(),
    schedule_at: z.string().optional(),
    visibility: z.string().optional(),
    products: z.array(z.string()).optional(),
  };
  server.registerTool(
    'publish_with_video',
    {
      title: 'Publish Video',
      description: '发布小红书视频内容（仅支持本地单个视频文件）',
      inputSchema: PublishVideoArgs,
    },
    wrap('publish_with_video', async (a: z.infer<z.ZodObject<typeof PublishVideoArgs>>) => {
      const r = await svc.publishVideo({
        title: a.title,
        content: a.content,
        video: a.video,
        tags: a.tags,
        scheduleAt: a.schedule_at,
        visibility: a.visibility,
        products: a.products,
      });
      return jsonOK(r);
    }),
  );

  server.registerTool(
    'list_feeds',
    {
      title: 'List Feeds',
      description:
        '获取 rednote.com（小红书海外站）首页 Feeds 列表（需登录）。每个 feed 都带 noteUrl 字段。未登录时会被风控墙拦截，请先 check_login_status / get_login_qrcode。',
      inputSchema: {},
    },
    wrap('list_feeds', async () => jsonOK(await svc.listFeeds())),
  );

  const FilterOptionSchema = z
    .object({
      sort_by: z.string().optional(),
      note_type: z.string().optional(),
      publish_time: z.string().optional(),
      search_scope: z.string().optional(),
      location: z.string().optional(),
    })
    .optional();
  const SearchFeedsArgs = {
    keyword: z.string().describe('Search keyword'),
    filters: FilterOptionSchema,
  };
  server.registerTool(
    'search_feeds',
    {
      title: 'Search Feeds',
      description:
        '搜索 rednote.com 内容（需要已登录；未登录会触发风控/登录墙导致超时——此时请先调用 check_login_status，未登录则用 get_login_qrcode 让用户扫码后再重试）',
      inputSchema: SearchFeedsArgs,
    },
    wrap('search_feeds', async (a: z.infer<z.ZodObject<typeof SearchFeedsArgs>>) => {
      if (!a.keyword) return textErr('搜索Feeds失败: 缺少关键词参数');
      const r = await svc.searchFeeds(a.keyword, {
        sortBy: a.filters?.sort_by,
        noteType: a.filters?.note_type,
        publishTime: a.filters?.publish_time,
        searchScope: a.filters?.search_scope,
        location: a.filters?.location,
      });
      return jsonOK(r);
    }),
  );

  const FeedDetailArgs = {
    feed_id: z.string(),
    xsec_token: z.string(),
    load_all_comments: z.boolean().optional(),
    limit: z.number().int().optional(),
    click_more_replies: z.boolean().optional(),
    reply_limit: z.number().int().optional(),
    scroll_speed: z.string().optional(),
  };
  server.registerTool(
    'get_feed_detail',
    {
      title: 'Get Feed Detail',
      description: '获取 rednote.com 笔记详情，默认返回前10条评论',
      inputSchema: FeedDetailArgs,
    },
    wrap('get_feed_detail', async (a: z.infer<z.ZodObject<typeof FeedDetailArgs>>) => {
      if (!a.feed_id) return textErr('获取Feed详情失败: 缺少feed_id参数');
      if (!a.xsec_token) return textErr('获取Feed详情失败: 缺少xsec_token参数');
      const cfg = defaultCommentLoadConfig();
      if (a.load_all_comments) {
        if (a.click_more_replies !== undefined) cfg.clickMoreReplies = a.click_more_replies;
        cfg.maxCommentItems = a.limit && a.limit > 0 ? a.limit : 20;
        cfg.maxRepliesThreshold = a.reply_limit && a.reply_limit > 0 ? a.reply_limit : 10;
        if (a.scroll_speed) cfg.scrollSpeed = a.scroll_speed;
      }
      const r = await svc.getFeedDetail(a.feed_id, a.xsec_token, !!a.load_all_comments, cfg);
      return jsonOK(r);
    }),
  );

  const UserProfileArgs = { user_id: z.string(), xsec_token: z.string() };
  server.registerTool(
    'user_profile',
    {
      title: 'User Profile',
      description: '获取指定的小红书用户主页',
      inputSchema: UserProfileArgs,
    },
    wrap('user_profile', async (a: z.infer<z.ZodObject<typeof UserProfileArgs>>) => {
      if (!a.user_id) return textErr('获取用户主页失败: 缺少user_id参数');
      if (!a.xsec_token) return textErr('获取用户主页失败: 缺少xsec_token参数');
      return jsonOK(await svc.userProfile(a.user_id, a.xsec_token));
    }),
  );

  const PostCommentArgs = { feed_id: z.string(), xsec_token: z.string(), content: z.string() };
  server.registerTool(
    'post_comment_to_feed',
    {
      title: 'Post Comment',
      description: '发表评论到小红书笔记',
      inputSchema: PostCommentArgs,
    },
    wrap('post_comment_to_feed', async (a: z.infer<z.ZodObject<typeof PostCommentArgs>>) => {
      if (!a.feed_id || !a.xsec_token || !a.content) return textErr('发表评论失败: 参数不完整');
      const r = await svc.postCommentToFeed(a.feed_id, a.xsec_token, a.content);
      return textOK(`评论发表成功 - Feed ID: ${r.feedId}`);
    }),
  );

  const ReplyCommentArgs = {
    feed_id: z.string(),
    xsec_token: z.string(),
    comment_id: z.string().optional(),
    user_id: z.string().optional(),
    content: z.string(),
  };
  server.registerTool(
    'reply_comment_in_feed',
    {
      title: 'Reply Comment',
      description: '回复小红书笔记下的指定评论',
      inputSchema: ReplyCommentArgs,
    },
    wrap('reply_comment_in_feed', async (a: z.infer<z.ZodObject<typeof ReplyCommentArgs>>) => {
      if (!a.feed_id || !a.xsec_token || !a.content) return textErr('回复评论失败: 参数不完整');
      if (!a.comment_id && !a.user_id) return textErr('回复评论失败: 缺少 comment_id 或 user_id');
      const r = await svc.replyCommentToFeed(
        a.feed_id,
        a.xsec_token,
        a.comment_id ?? '',
        a.user_id ?? '',
        a.content,
      );
      return textOK(
        `评论回复成功 - Feed ID: ${r.feedId}, Comment ID: ${r.targetCommentId}, User ID: ${r.targetUserId}`,
      );
    }),
  );

  const LikeFeedArgs = {
    feed_id: z.string(),
    xsec_token: z.string(),
    unlike: z.boolean().optional(),
  };
  server.registerTool(
    'like_feed',
    {
      title: 'Like Feed',
      description: '为指定笔记点赞或取消点赞',
      inputSchema: LikeFeedArgs,
    },
    wrap('like_feed', async (a: z.infer<z.ZodObject<typeof LikeFeedArgs>>) => {
      if (!a.feed_id || !a.xsec_token) return textErr('操作失败: 参数不完整');
      const r = a.unlike
        ? await svc.unlikeFeed(a.feed_id, a.xsec_token)
        : await svc.likeFeed(a.feed_id, a.xsec_token);
      return textOK(`${a.unlike ? '取消点赞' : '点赞'}成功 - Feed ID: ${r.feedId}`);
    }),
  );

  const FavoriteFeedArgs = {
    feed_id: z.string(),
    xsec_token: z.string(),
    unfavorite: z.boolean().optional(),
  };
  server.registerTool(
    'favorite_feed',
    {
      title: 'Favorite Feed',
      description: '收藏指定笔记或取消收藏',
      inputSchema: FavoriteFeedArgs,
    },
    wrap('favorite_feed', async (a: z.infer<z.ZodObject<typeof FavoriteFeedArgs>>) => {
      if (!a.feed_id || !a.xsec_token) return textErr('操作失败: 参数不完整');
      const r = a.unfavorite
        ? await svc.unfavoriteFeed(a.feed_id, a.xsec_token)
        : await svc.favoriteFeed(a.feed_id, a.xsec_token);
      return textOK(`${a.unfavorite ? '取消收藏' : '收藏'}成功 - Feed ID: ${r.feedId}`);
    }),
  );

  logger.info('MCP Server initialized: 13 tools registered');
  return server;
}
