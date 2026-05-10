// rednote.com 主站 / 創作者中心
export const MAIN_HOST = 'www.rednote.com';
export const CREATOR_HOST = 'creator.rednote.com';

export function hostURL(): string {
  return `https://${MAIN_HOST}`;
}

export function creatorURL(): string {
  return `https://${CREATOR_HOST}`;
}

export const URL_OF_PUBLISH = `${creatorURL()}/publish/publish?source=official`;
