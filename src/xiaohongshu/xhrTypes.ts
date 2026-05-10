// 對應 Go xiaohongshu/xhr_types.go：解析 rednote.com snake_case JSON → 內部型別

import type {
  Comment,
  CommentList,
  Cover,
  DetailImageInfo,
  Feed,
  FeedDetailResponse,
  ImageInfo,
  InteractInfo,
  NoteCard,
  User,
  UserBasicInfo,
  UserInteractions,
  UserProfileResponse,
  Video,
} from './types.js';
import { hostURL } from './host.js';

interface OsCommonResp {
  code: number;
  success: boolean;
  msg: string;
  data: unknown;
}

function parseOsResp(body: string): OsCommonResp {
  const r = JSON.parse(body) as OsCommonResp;
  if (r.code !== 0) throw new Error(`xhr api code=${r.code} msg=${r.msg ?? ''}`);
  return r;
}

function firstNonEmpty(...ss: (string | undefined | null)[]): string {
  for (const s of ss) if (s) return s;
  return '';
}

function anyToString(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  return JSON.stringify(v);
}

// makeNoteShareURL: pc_search 來源，rednote 對此 source 較穩定
export function makeNoteShareURL(feedID: string, xsecToken: string): string {
  if (!feedID || !xsecToken) return '';
  return `${hostURL()}/explore/${feedID}?xsec_token=${xsecToken}&xsec_source=pc_search`;
}

interface OsUser {
  user_id?: string;
  nickname?: string;
  nick_name?: string;
  avatar?: string;
  xsec_token?: string;
}

interface OsInteract {
  liked?: boolean;
  liked_count?: string;
  collected?: boolean;
  collected_count?: string;
  comment_count?: string;
  shared_count?: string;
}

interface OsImageInfo {
  image_scene?: string;
  url?: string;
}

interface OsCover {
  width?: number;
  height?: number;
  url?: string;
  url_pre?: string;
  url_default?: string;
  file_id?: string;
  info_list?: OsImageInfo[];
}

interface OsVideoCapa {
  duration?: number;
}

interface OsVideo {
  capa?: OsVideoCapa;
}

interface OsNoteCard {
  type?: string;
  display_title?: string;
  user?: OsUser;
  interact_info?: OsInteract;
  cover?: OsCover;
  video?: OsVideo;
}

interface OsFeedItem {
  id?: string;
  note_id?: string;
  xsec_token?: string;
  model_type?: string;
  note_card?: OsNoteCard;
}

function feedItemToFeed(it: OsFeedItem, idx: number): Feed {
  const nc = it.note_card ?? {};
  const u = nc.user ?? {};
  const user: User = {
    userId: u.user_id ?? '',
    nickname: u.nickname || u.nick_name || '',
    nickName: u.nick_name ?? '',
    avatar: u.avatar ?? '',
  };
  const cv = nc.cover ?? {};
  const cover: Cover = {
    width: cv.width ?? 0,
    height: cv.height ?? 0,
    url: cv.url ?? '',
    urlPre: cv.url_pre ?? '',
    urlDefault: cv.url_default ?? '',
    fileId: cv.file_id ?? '',
    infoList: (cv.info_list ?? []).map<ImageInfo>((ii) => ({
      imageScene: ii.image_scene ?? '',
      url: ii.url ?? '',
    })),
  };
  const ii = nc.interact_info ?? {};
  const interact: InteractInfo = {
    liked: !!ii.liked,
    likedCount: ii.liked_count ?? '',
    collected: !!ii.collected,
    collectedCount: ii.collected_count ?? '',
    commentCount: ii.comment_count ?? '',
    sharedCount: ii.shared_count ?? '',
  };
  const noteCard: NoteCard = {
    type: nc.type ?? '',
    displayTitle: nc.display_title ?? '',
    user,
    interactInfo: interact,
    cover,
  };
  if (nc.video) {
    const v: Video = { capa: { duration: nc.video.capa?.duration ?? 0 } };
    noteCard.video = v;
  }
  const id = it.id || it.note_id || '';
  const xsec = firstNonEmpty(it.xsec_token, u.xsec_token);
  const feed: Feed = {
    id,
    modelType: it.model_type ?? '',
    xsecToken: xsec,
    index: idx,
    noteCard,
    noteUrl: makeNoteShareURL(id, xsec),
  };
  return feed;
}

export function parseXHRFeedList(body: string): Feed[] {
  const r = parseOsResp(body);
  const data = (r.data ?? {}) as { items?: OsFeedItem[] };
  const items = data.items ?? [];
  const feeds: Feed[] = [];
  items.forEach((it, i) => {
    const nc = it.note_card ?? {};
    if (!nc.type && !nc.display_title) return; // 廣告/推薦用戶
    feeds.push(feedItemToFeed(it, i));
  });
  return feeds;
}

interface OsDetailImage {
  width?: number;
  height?: number;
  url_default?: string;
  url_pre?: string;
  live_photo?: boolean;
}

interface OsDetailNoteCard {
  note_id?: string;
  type?: string;
  title?: string;
  desc?: string;
  time?: number;
  ip_location?: string;
  user?: OsUser;
  interact_info?: OsInteract;
  image_list?: OsDetailImage[];
  xsec_token?: string;
}

export function parseXHRFeedDetail(
  body: string,
  fallbackID: string,
  fallbackToken: string,
): FeedDetailResponse {
  const r = parseOsResp(body);
  const data = (r.data ?? {}) as {
    items?: { id?: string; model_type?: string; note_card?: OsDetailNoteCard }[];
  };
  const items = data.items ?? [];
  if (items.length === 0) throw new Error('feed detail empty');
  const it = items[0]!;
  const nc = it.note_card ?? {};
  const u = nc.user ?? {};
  const ii = nc.interact_info ?? {};
  const images: DetailImageInfo[] = (nc.image_list ?? []).map((im) => ({
    width: im.width ?? 0,
    height: im.height ?? 0,
    urlDefault: im.url_default ?? '',
    urlPre: im.url_pre ?? '',
    livePhoto: im.live_photo,
  }));
  const id = nc.note_id || it.id || fallbackID;
  const token = firstNonEmpty(nc.xsec_token, fallbackToken);
  return {
    note: {
      noteId: id,
      xsecToken: token,
      title: nc.title ?? '',
      desc: nc.desc ?? '',
      type: nc.type ?? '',
      time: nc.time ?? 0,
      ipLocation: nc.ip_location ?? '',
      user: {
        userId: u.user_id ?? '',
        nickname: firstNonEmpty(u.nickname, u.nick_name),
        nickName: u.nick_name ?? '',
        avatar: u.avatar ?? '',
      },
      interactInfo: {
        liked: !!ii.liked,
        likedCount: ii.liked_count ?? '',
        collected: !!ii.collected,
        collectedCount: ii.collected_count ?? '',
        commentCount: ii.comment_count ?? '',
        sharedCount: ii.shared_count ?? '',
      },
      imageList: images,
      noteUrl: makeNoteShareURL(id, token),
    },
    comments: { list: [], cursor: '', hasMore: false },
  };
}

interface OsComment {
  id?: string;
  note_id?: string;
  content?: string;
  like_count?: string;
  create_time?: number;
  ip_location?: string;
  liked?: boolean;
  user_info?: OsUser;
  sub_comment_count?: string;
  sub_comments?: OsComment[];
  show_tags?: string[];
}

function osCommentToComment(c: OsComment): Comment {
  const u = c.user_info ?? {};
  return {
    id: c.id ?? '',
    noteId: c.note_id ?? '',
    content: c.content ?? '',
    likeCount: c.like_count ?? '',
    createTime: c.create_time ?? 0,
    ipLocation: c.ip_location ?? '',
    liked: !!c.liked,
    userInfo: {
      userId: u.user_id ?? '',
      nickname: firstNonEmpty(u.nickname, u.nick_name),
      nickName: u.nick_name ?? '',
      avatar: u.avatar ?? '',
    },
    subCommentCount: c.sub_comment_count ?? '',
    subComments: (c.sub_comments ?? []).map(osCommentToComment),
    showTags: c.show_tags ?? [],
  };
}

export function parseXHRComments(body: string): CommentList {
  const r = parseOsResp(body);
  const data = (r.data ?? {}) as {
    comments?: OsComment[];
    cursor?: string;
    has_more?: boolean;
  };
  return {
    list: (data.comments ?? []).map(osCommentToComment),
    cursor: data.cursor ?? '',
    hasMore: !!data.has_more,
  };
}

interface OsOtherInfoBasic {
  gender?: number;
  ip_location?: string;
  desc?: string;
  imageb?: string;
  nickname?: string;
  images?: string;
  red_id?: string;
}

interface OsOtherInfoInteraction {
  type?: string;
  name?: string;
  count?: unknown;
}

export function parseXHROtherInfo(body: string): UserProfileResponse {
  const r = parseOsResp(body);
  const data = (r.data ?? {}) as {
    basic_info?: OsOtherInfoBasic;
    interactions?: OsOtherInfoInteraction[];
  };
  const b = data.basic_info ?? {};
  const basic: UserBasicInfo = {
    gender: b.gender ?? 0,
    ipLocation: b.ip_location ?? '',
    desc: b.desc ?? '',
    imageb: b.imageb ?? '',
    nickname: b.nickname ?? '',
    images: b.images ?? '',
    redId: b.red_id ?? '',
  };
  const interactions: UserInteractions[] = (data.interactions ?? []).map((i) => ({
    type: i.type ?? '',
    name: i.name ?? '',
    count: anyToString(i.count),
  }));
  return { userBasicInfo: basic, interactions, feeds: [] };
}

interface OsUserPostedNote {
  note_id?: string;
  xsec_token?: string;
  type?: string;
  display_title?: string;
  user?: OsUser;
  interact_info?: OsInteract;
  cover?: OsCover;
}

export function parseXHRUserPosted(body: string): Feed[] {
  const r = parseOsResp(body);
  const data = (r.data ?? {}) as { notes?: OsUserPostedNote[] };
  return (data.notes ?? []).map((n, i) => {
    const cv = n.cover ?? {};
    const cover: Cover = {
      width: cv.width ?? 0,
      height: cv.height ?? 0,
      url: cv.url ?? '',
      urlPre: cv.url_pre ?? '',
      urlDefault: cv.url_default ?? '',
      fileId: cv.file_id ?? '',
      infoList: (cv.info_list ?? []).map((ii) => ({
        imageScene: ii.image_scene ?? '',
        url: ii.url ?? '',
      })),
    };
    const u = n.user ?? {};
    const ii = n.interact_info ?? {};
    return {
      id: n.note_id ?? '',
      modelType: '',
      xsecToken: n.xsec_token ?? '',
      index: i,
      noteUrl: makeNoteShareURL(n.note_id ?? '', n.xsec_token ?? ''),
      noteCard: {
        type: n.type ?? '',
        displayTitle: n.display_title ?? '',
        user: {
          userId: u.user_id ?? '',
          nickname: firstNonEmpty(u.nickname, u.nick_name),
          nickName: u.nick_name ?? '',
          avatar: u.avatar ?? '',
        },
        interactInfo: {
          liked: !!ii.liked,
          likedCount: ii.liked_count ?? '',
          collected: !!ii.collected,
          collectedCount: ii.collected_count ?? '',
          commentCount: ii.comment_count ?? '',
          sharedCount: ii.shared_count ?? '',
        },
        cover,
      },
    };
  });
}
