// 搜尋 filter 對應表（對應 Go xiaohongshu/search.go 的 filterOptionsMap）
import type { FilterOption } from './types.js';

export interface InternalFilter {
  filtersIndex: number;
  tagsIndex: number;
  text: string;
}

const filterOptionsMap: Record<number, InternalFilter[]> = {
  1: [
    { filtersIndex: 1, tagsIndex: 1, text: '综合' },
    { filtersIndex: 1, tagsIndex: 2, text: '最新' },
    { filtersIndex: 1, tagsIndex: 3, text: '最多点赞' },
    { filtersIndex: 1, tagsIndex: 4, text: '最多评论' },
    { filtersIndex: 1, tagsIndex: 5, text: '最多收藏' },
  ],
  2: [
    { filtersIndex: 2, tagsIndex: 1, text: '不限' },
    { filtersIndex: 2, tagsIndex: 2, text: '视频' },
    { filtersIndex: 2, tagsIndex: 3, text: '图文' },
  ],
  3: [
    { filtersIndex: 3, tagsIndex: 1, text: '不限' },
    { filtersIndex: 3, tagsIndex: 2, text: '一天内' },
    { filtersIndex: 3, tagsIndex: 3, text: '一周内' },
    { filtersIndex: 3, tagsIndex: 4, text: '半年内' },
  ],
  4: [
    { filtersIndex: 4, tagsIndex: 1, text: '不限' },
    { filtersIndex: 4, tagsIndex: 2, text: '已看过' },
    { filtersIndex: 4, tagsIndex: 3, text: '未看过' },
    { filtersIndex: 4, tagsIndex: 4, text: '已关注' },
  ],
  5: [
    { filtersIndex: 5, tagsIndex: 1, text: '不限' },
    { filtersIndex: 5, tagsIndex: 2, text: '同城' },
    { filtersIndex: 5, tagsIndex: 3, text: '附近' },
  ],
};

function findInternalOption(filtersIndex: number, text: string): InternalFilter {
  const opts = filterOptionsMap[filtersIndex];
  if (!opts) throw new Error(`筛选组 ${filtersIndex} 不存在`);
  const found = opts.find((o) => o.text === text);
  if (!found) throw new Error(`在筛选组 ${filtersIndex} 中未找到文本 '${text}'`);
  return found;
}

export function convertToInternalFilters(filter: FilterOption): InternalFilter[] {
  const out: InternalFilter[] = [];
  if (filter.sortBy) out.push(findInternalOption(1, filter.sortBy));
  if (filter.noteType) out.push(findInternalOption(2, filter.noteType));
  if (filter.publishTime) out.push(findInternalOption(3, filter.publishTime));
  if (filter.searchScope) out.push(findInternalOption(4, filter.searchScope));
  if (filter.location) out.push(findInternalOption(5, filter.location));
  return out;
}
