// XHR API path 常數 + Feed 詳情/評論 URL 工具

export const OS_API_SEARCH_NOTES = '/api/sns/web/v1/search/notes';
export const OS_API_HOMEFEED = '/api/sns/web/v1/homefeed';
export const OS_API_FEED = '/api/sns/web/v1/feed';
export const OS_API_COMMENTS = '/api/sns/web/v2/comment/page';
export const OS_API_OTHERINFO = '/api/sns/web/v1/user/otherinfo';
export const OS_API_SELFINFO = '/api/sns/web/v1/user/selfinfo';
export const OS_API_USER_POSTED = '/api/sns/web/v1/user_posted';

export const OS_CAPTURE_TIMEOUT = 45_000;
export const OS_SETTLE_WAIT = 3_000;

import { hostURL } from './host.js';

export function makeFeedDetailURL(feedID: string, xsecToken: string): string {
  return `${hostURL()}/explore/${feedID}?xsec_token=${xsecToken}&xsec_source=pc_feed`;
}

export function makeUserProfileURL(userID: string, xsecToken: string): string {
  return `${hostURL()}/user/profile/${userID}?xsec_token=${xsecToken}&xsec_source=pc_note`;
}

export function makeSearchURL(keyword: string): string {
  const params = new URLSearchParams({ keyword, source: 'web_explore_feed' });
  return `${hostURL()}/search_result?${params.toString()}`;
}
