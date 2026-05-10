// HTTP Server (Fastify) — 對應 Go routes.go
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { logger } from '../logger.js';
import { getCookiesFilePath } from '../cookies.js';
import type { XiaohongshuService } from '../service/xiaohongshuService.js';

interface ErrorResponse {
  error: string;
  code: string;
  details?: unknown;
}
interface SuccessResponse<T> {
  success: true;
  data: T;
  message: string;
}

function ok<T>(reply: FastifyReply, data: T, message: string): FastifyReply {
  const body: SuccessResponse<T> = { success: true, data, message };
  return reply.code(200).send(body);
}
function err(
  reply: FastifyReply,
  status: number,
  code: string,
  message: string,
  details?: unknown,
): FastifyReply {
  const body: ErrorResponse = { error: message, code, details };
  return reply.code(status).send(body);
}

export function buildHttpServer(svc: XiaohongshuService, mcp: McpServer): FastifyInstance {
  const app = Fastify({ logger: false });

  app.addHook('onResponse', (req, reply, done) => {
    logger.info({ method: req.method, url: req.url, status: reply.statusCode }, 'http');
    done();
  });

  // CORS
  app.addHook('onRequest', (req, reply, done) => {
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, mcp-session-id');
    if (req.method === 'OPTIONS') return reply.code(204).send();
    done();
  });

  app.get('/health', (_req, reply) =>
    ok(reply, { status: 'healthy', service: 'rednote-mcp', timestamp: 'now' }, '服务正常'),
  );

  // ===== MCP Streamable HTTP =====
  // 對應 Go 的 /mcp 與 /mcp/*。每個 session 對應一個 transport，存於 map。
  const transports = new Map<string, StreamableHTTPServerTransport>();

  const handleMcp = async (req: FastifyRequest, reply: FastifyReply) => {
    const sessionId = (req.headers['mcp-session-id'] as string | undefined) ?? '';
    let transport = transports.get(sessionId);
    if (!transport) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id: string) => {
          transports.set(id, transport!);
        },
      });
      transport.onclose = () => {
        if (transport!.sessionId) transports.delete(transport!.sessionId);
      };
      await mcp.connect(transport);
    }
    // Fastify 已 parse body；轉交給 transport
    await transport.handleRequest(req.raw, reply.raw, req.body);
  };

  app.all('/mcp', handleMcp);
  app.all('/mcp/*', handleMcp);

  // ===== /api/v1 =====
  const api = '/api/v1';

  app.get(`${api}/login/status`, async (_req, reply) => {
    try {
      const r = await svc.checkLoginStatus();
      return ok(reply, r, '检查登录状态成功');
    } catch (e) {
      return err(reply, 500, 'STATUS_CHECK_FAILED', '检查登录状态失败', (e as Error).message);
    }
  });
  app.get(`${api}/login/qrcode`, async (_req, reply) => {
    try {
      const r = await svc.getLoginQrcode();
      return ok(reply, r, '获取登录二维码成功');
    } catch (e) {
      return err(reply, 500, 'STATUS_CHECK_FAILED', '获取登录二维码失败', (e as Error).message);
    }
  });
  app.delete(`${api}/login/cookies`, async (_req, reply) => {
    try {
      await svc.deleteCookies();
      return ok(
        reply,
        { cookie_path: getCookiesFilePath(), message: 'Cookies 已成功删除' },
        '删除 cookies 成功',
      );
    } catch (e) {
      return err(reply, 500, 'DELETE_COOKIES_FAILED', '删除 cookies 失败', (e as Error).message);
    }
  });

  app.post(`${api}/publish`, async (req, reply) => {
    const body = req.body as Record<string, unknown>;
    try {
      const r = await svc.publishContent({
        title: String(body.title ?? ''),
        content: String(body.content ?? ''),
        images: (body.images ?? []) as string[],
        tags: (body.tags ?? []) as string[],
        scheduleAt: body.schedule_at as string | undefined,
        isOriginal: body.is_original as boolean | undefined,
        visibility: body.visibility as string | undefined,
        products: (body.products ?? []) as string[],
      });
      return ok(reply, r, '发布成功');
    } catch (e) {
      return err(reply, 500, 'PUBLISH_FAILED', '发布失败', (e as Error).message);
    }
  });

  app.post(`${api}/publish_video`, async (req, reply) => {
    const body = req.body as Record<string, unknown>;
    try {
      const r = await svc.publishVideo({
        title: String(body.title ?? ''),
        content: String(body.content ?? ''),
        video: String(body.video ?? ''),
        tags: (body.tags ?? []) as string[],
        scheduleAt: body.schedule_at as string | undefined,
        visibility: body.visibility as string | undefined,
        products: (body.products ?? []) as string[],
      });
      return ok(reply, r, '视频发布成功');
    } catch (e) {
      return err(reply, 500, 'PUBLISH_VIDEO_FAILED', '视频发布失败', (e as Error).message);
    }
  });

  app.get(`${api}/feeds/list`, async (_req, reply) => {
    try {
      return ok(reply, await svc.listFeeds(), '获取Feeds列表成功');
    } catch (e) {
      return err(reply, 500, 'LIST_FEEDS_FAILED', '获取Feeds列表失败', (e as Error).message);
    }
  });

  const searchHandler = async (req: FastifyRequest, reply: FastifyReply) => {
    let keyword = '';
    let filters: Record<string, string | undefined> | undefined;
    if (req.method === 'POST') {
      const body = (req.body ?? {}) as Record<string, unknown>;
      keyword = String(body.keyword ?? '');
      const f = body.filters as Record<string, string> | undefined;
      filters = f
        ? {
            sortBy: f.sort_by,
            noteType: f.note_type,
            publishTime: f.publish_time,
            searchScope: f.search_scope,
            location: f.location,
          }
        : undefined;
    } else {
      keyword = String((req.query as Record<string, unknown>).keyword ?? '');
    }
    if (!keyword)
      return err(reply, 400, 'MISSING_KEYWORD', '缺少关键词参数', 'keyword parameter is required');
    try {
      return ok(reply, await svc.searchFeeds(keyword, filters), '搜索Feeds成功');
    } catch (e) {
      return err(reply, 500, 'SEARCH_FEEDS_FAILED', '搜索Feeds失败', (e as Error).message);
    }
  };
  app.get(`${api}/feeds/search`, searchHandler);
  app.post(`${api}/feeds/search`, searchHandler);

  app.post(`${api}/feeds/detail`, async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    try {
      const r = await svc.getFeedDetail(
        String(body.feed_id ?? ''),
        String(body.xsec_token ?? ''),
        !!body.load_all_comments,
      );
      return ok(reply, r, '获取Feed详情成功');
    } catch (e) {
      return err(reply, 500, 'GET_FEED_DETAIL_FAILED', '获取Feed详情失败', (e as Error).message);
    }
  });

  app.post(`${api}/user/profile`, async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    try {
      const r = await svc.userProfile(String(body.user_id ?? ''), String(body.xsec_token ?? ''));
      return ok(reply, { data: r }, '获取用户主页成功');
    } catch (e) {
      return err(reply, 500, 'GET_USER_PROFILE_FAILED', '获取用户主页失败', (e as Error).message);
    }
  });

  app.post(`${api}/feeds/comment`, async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    try {
      const r = await svc.postCommentToFeed(
        String(body.feed_id ?? ''),
        String(body.xsec_token ?? ''),
        String(body.content ?? ''),
      );
      return ok(reply, r, r.message);
    } catch (e) {
      return err(reply, 500, 'POST_COMMENT_FAILED', '发表评论失败', (e as Error).message);
    }
  });

  app.post(`${api}/feeds/comment/reply`, async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    try {
      const r = await svc.replyCommentToFeed(
        String(body.feed_id ?? ''),
        String(body.xsec_token ?? ''),
        String(body.comment_id ?? ''),
        String(body.user_id ?? ''),
        String(body.content ?? ''),
      );
      return ok(reply, r, r.message);
    } catch (e) {
      return err(reply, 500, 'REPLY_COMMENT_FAILED', '回复评论失败', (e as Error).message);
    }
  });

  app.get(`${api}/user/me`, async (_req, reply) => {
    try {
      return ok(reply, { data: await svc.getMyProfile() }, '获取我的主页成功');
    } catch (e) {
      return err(reply, 500, 'GET_MY_PROFILE_FAILED', '获取我的主页失败', (e as Error).message);
    }
  });

  return app;
}
