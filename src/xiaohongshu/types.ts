// rednote.com Feed/Comment/User 等資料結構（對應 Go xiaohongshu/types.go）

export interface User {
  userId: string;
  nickname: string;
  nickName: string;
  avatar: string;
}

export interface InteractInfo {
  liked: boolean;
  likedCount: string;
  sharedCount: string;
  commentCount: string;
  collectedCount: string;
  collected: boolean;
}

export interface ImageInfo {
  imageScene: string;
  url: string;
}

export interface Cover {
  width: number;
  height: number;
  url: string;
  fileId: string;
  urlPre: string;
  urlDefault: string;
  infoList: ImageInfo[];
}

export interface VideoCapability {
  duration: number;
}

export interface Video {
  capa: VideoCapability;
}

export interface NoteCard {
  type: string;
  displayTitle: string;
  user: User;
  interactInfo: InteractInfo;
  cover: Cover;
  video?: Video;
}

export interface Feed {
  xsecToken: string;
  id: string;
  modelType: string;
  noteCard: NoteCard;
  index: number;
  noteUrl?: string;
}

export interface DetailImageInfo {
  width: number;
  height: number;
  urlDefault: string;
  urlPre: string;
  livePhoto?: boolean;
}

export interface FeedDetail {
  noteId: string;
  xsecToken: string;
  title: string;
  desc: string;
  type: string;
  time: number;
  ipLocation: string;
  user: User;
  interactInfo: InteractInfo;
  imageList: DetailImageInfo[];
  noteUrl?: string;
}

export interface Comment {
  id: string;
  noteId: string;
  content: string;
  likeCount: string;
  createTime: number;
  ipLocation: string;
  liked: boolean;
  userInfo: User;
  subCommentCount: string;
  subComments: Comment[];
  showTags: string[];
}

export interface CommentList {
  list: Comment[];
  cursor: string;
  hasMore: boolean;
}

export interface FeedDetailResponse {
  note: FeedDetail;
  comments: CommentList;
}

export interface UserBasicInfo {
  gender: number;
  ipLocation: string;
  desc: string;
  imageb: string;
  nickname: string;
  images: string;
  redId: string;
}

export interface UserInteractions {
  type: string;
  name: string;
  count: string;
}

export interface UserProfileResponse {
  userBasicInfo: UserBasicInfo;
  interactions: UserInteractions[];
  feeds: Feed[];
}

// 評論加載配置（rednote XHR 模式下大部分欄位保留以對齊 API，但實際只回首屏）
export interface CommentLoadConfig {
  clickMoreReplies: boolean;
  maxRepliesThreshold: number;
  maxCommentItems: number;
  scrollSpeed: string;
}

export function defaultCommentLoadConfig(): CommentLoadConfig {
  return {
    clickMoreReplies: false,
    maxRepliesThreshold: 10,
    maxCommentItems: 0,
    scrollSpeed: 'normal',
  };
}

// 搜尋筛選
export interface FilterOption {
  sortBy?: string;
  noteType?: string;
  publishTime?: string;
  searchScope?: string;
  location?: string;
}

// 通用 Action 結果
export interface ActionResult {
  feedId: string;
  success: boolean;
  message: string;
}
