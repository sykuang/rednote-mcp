// e2e smoke：使用既有 cookies.json 跑讀取類操作
import { XiaohongshuService } from '../dist/service/xiaohongshuService.js';

const svc = new XiaohongshuService();

async function step(name, fn) {
  process.stderr.write(`\n=== ${name} ===\n`);
  try {
    const r = await fn();
    const s = JSON.stringify(r);
    console.log(name, 'OK', s.length > 400 ? s.slice(0, 400) + '...' : s);
  } catch (e) {
    console.error(name, 'FAIL', e.message);
  }
}

await step('checkLoginStatus', () => svc.checkLoginStatus());
const feeds = await svc.listFeeds();
console.log('listFeeds OK count=', feeds.feeds?.length);
const f = feeds.feeds?.[0];
if (f) {
  await step(`getFeedDetail(${f.id})`, () => svc.getFeedDetail(f.id, f.xsecToken, false));
}
await step('searchFeeds', () => svc.searchFeeds('美食'));
await step('getMyProfile', () => svc.getMyProfile());

process.exit(0);
