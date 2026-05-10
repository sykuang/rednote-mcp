// 發佈共用：tab 切換、標題/正文/標籤、可見性、原創、定時、商品綁定
// 對應 Go xiaohongshu/publish.go
import type { ElementHandle, Locator, Page } from 'playwright';
import { logger } from '../logger.js';
import { sleep } from '../util/sleep.js';
import { URL_OF_PUBLISH } from './host.js';

export interface CommonPublishOptions {
  title: string;
  content: string;
  tags: string[];
  scheduleTime?: Date;
  visibility?: string;
  products?: string[];
}

export async function gotoPublishPage(page: Page, tabName: '上传图文' | '上传视频'): Promise<void> {
  page.setDefaultTimeout(300_000);
  logger.info({ url: URL_OF_PUBLISH, tab: tabName }, 'goto publish page');
  await page.goto(URL_OF_PUBLISH, { waitUntil: 'load', timeout: 60_000 });
  await sleep(2_000);
  try {
    await page.waitForLoadState('networkidle', { timeout: 10_000 });
  } catch {
    /* ignore */
  }
  await sleep(1_000);
  await mustClickPublishTab(page, tabName);
  await sleep(1_000);
}

async function mustClickPublishTab(page: Page, tabname: string): Promise<void> {
  await page.locator('div.upload-content').first().waitFor({ state: 'visible', timeout: 30_000 });
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const tabs = page.locator('div.creator-tab');
    const count = await tabs.count();
    let clicked = false;
    for (let i = 0; i < count; i++) {
      const t = tabs.nth(i);
      if (!(await t.isVisible())) continue;
      const txt = ((await t.textContent()) ?? '').trim();
      if (txt !== tabname) continue;
      try {
        await t.click({ timeout: 2_000 });
        clicked = true;
        break;
      } catch (e) {
        logger.warn({ err: (e as Error).message }, 'click tab failed, retry');
      }
    }
    if (clicked) return;
    // 嘗試移除遮罩
    await removePopCover(page);
    await sleep(200);
  }
  throw new Error(`没有找到发布 TAB - ${tabname}`);
}

async function removePopCover(page: Page): Promise<void> {
  try {
    const el = await page.$('div.d-popover');
    if (el) await el.evaluate((n) => n.remove());
  } catch {
    /* ignore */
  }
  try {
    const x = 380 + Math.floor(Math.random() * 100);
    const y = 20 + Math.floor(Math.random() * 60);
    await page.mouse.move(x, y);
    await page.mouse.click(x, y);
  } catch {
    /* ignore */
  }
}

// ====== 上傳圖文/視頻 ======

export async function uploadImages(page: Page, paths: string[]): Promise<void> {
  const fs = await import('node:fs');
  const valid: string[] = [];
  for (const p of paths) {
    if (fs.existsSync(p)) {
      valid.push(p);
      logger.info({ p }, 'valid image');
    } else {
      logger.warn({ p }, 'image not exist, skip');
    }
  }
  for (let i = 0; i < valid.length; i++) {
    const sel = i === 0 ? '.upload-input' : 'input[type="file"]';
    const input = page.locator(sel).first();
    await input.setInputFiles(valid[i]!);
    logger.info({ i: i + 1, p: valid[i] }, 'image submitted');
    await waitForUploadComplete(page, i + 1);
    await sleep(1_000);
  }
}

async function waitForUploadComplete(page: Page, expected: number): Promise<void> {
  const deadline = Date.now() + 60_000;
  let lastLog = expected - 1;
  while (Date.now() < deadline) {
    const cur = await page.locator('.img-preview-area .pr').count();
    if (cur !== lastLog) {
      logger.info({ current: cur, expected }, 'waiting upload');
      lastLog = cur;
    }
    if (cur >= expected) return;
    await sleep(500);
  }
  throw new Error(`第${expected}张图片上传超时(60s)`);
}

export async function uploadVideo(page: Page, videoPath: string): Promise<void> {
  const fs = await import('node:fs');
  if (!fs.existsSync(videoPath)) throw new Error(`视频文件不存在: ${videoPath}`);
  let input = page.locator('.upload-input').first();
  if ((await input.count()) === 0) input = page.locator('input[type="file"]').first();
  await input.setInputFiles(videoPath);
  // 等待發佈鈕可點擊
  await waitForPublishButtonClickable(page);
  logger.info('视频处理完成，发布按钮可点击');
}

// ====== 標題/正文/標籤 ======

export async function fillTitle(page: Page, title: string): Promise<Locator> {
  const titleEl = page.locator('div.d-input input').first();
  await titleEl.waitFor({ state: 'visible', timeout: 30_000 });
  await titleEl.fill(title);
  await sleep(500);
  await checkTitleMaxLength(page);
  return titleEl;
}

async function checkTitleMaxLength(page: Page): Promise<void> {
  const el = page.locator('div.title-container div.max_suffix').first();
  if ((await el.count()) === 0) return;
  const text = ((await el.textContent()) ?? '').trim();
  throw makeMaxLengthError(text);
}

async function checkContentMaxLength(page: Page): Promise<void> {
  const el = page.locator('div.edit-container div.length-error').first();
  if ((await el.count()) === 0) return;
  const text = ((await el.textContent()) ?? '').trim();
  throw makeMaxLengthError(text);
}

function makeMaxLengthError(text: string): Error {
  const parts = text.split('/');
  if (parts.length !== 2) return new Error(`长度超过限制: ${text}`);
  return new Error(`当前输入长度为${parts[0]}，最大长度为${parts[1]}`);
}

export async function getContentElement(page: Page): Promise<Locator> {
  const direct = page.locator('div.ql-editor').first();
  if ((await direct.count()) > 0) return direct;
  // 從 placeholder 反查
  const handle = await page.evaluateHandle(() => {
    const ps = Array.from(document.querySelectorAll('p'));
    for (const p of ps) {
      const ph = p.getAttribute('data-placeholder');
      if (ph && ph.includes('输入正文描述')) {
        let cur: HTMLElement | null = p as HTMLElement;
        for (let i = 0; i < 5 && cur; i++) {
          const parent: HTMLElement | null = cur.parentElement;
          if (!parent) break;
          if (parent.getAttribute('role') === 'textbox') return parent;
          cur = parent;
        }
      }
    }
    return null;
  });
  const el = handle.asElement() as ElementHandle<HTMLElement> | null;
  if (!el) throw new Error('没有找到内容输入框');
  // 包成 locator: 透過設置 id
  const id = `__content_target_${Date.now()}`;
  await el.evaluate((n, idVal) => {
    if (!n.id) n.id = idVal;
  }, id);
  const realId = await el.evaluate((n) => n.id);
  return page.locator(`#${realId}`).first();
}

export async function fillContentAndTags(
  page: Page,
  titleEl: Locator,
  content: string,
  tags: string[],
): Promise<void> {
  const contentEl = await getContentElement(page);
  await contentEl.click();
  await page.keyboard.type(content);
  // 回點標題以穩定後續互動
  await sleep(1_000);
  await titleEl.click();
  await inputTags(page, contentEl, tags);
  await sleep(1_000);
  await checkContentMaxLength(page);
}

async function inputTags(page: Page, contentEl: Locator, tagsRaw: string[]): Promise<void> {
  if (tagsRaw.length === 0) return;
  await contentEl.click();
  await sleep(1_000);
  // 先把光標移到末尾
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press('ArrowDown');
    await sleep(10);
  }
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await sleep(1_000);

  for (const raw of tagsRaw) {
    const tag = raw.replace(/^#+/, '');
    await inputSingleTag(page, contentEl, tag);
  }
}

async function inputSingleTag(page: Page, contentEl: Locator, tag: string): Promise<void> {
  await page.keyboard.type('#');
  await sleep(200);
  for (const ch of tag) {
    await page.keyboard.type(ch);
    await sleep(50);
  }
  await sleep(1_000);
  const container = page.locator('#creator-editor-topic-container').first();
  if ((await container.count()) === 0) {
    logger.warn({ tag }, '无标签下拉，输入空格收尾');
    await page.keyboard.type(' ');
    return;
  }
  const item = container.locator('.item').first();
  if ((await item.count()) === 0) {
    logger.warn({ tag }, '无联想选项，输入空格收尾');
    await page.keyboard.type(' ');
    return;
  }
  await item.click();
  logger.info({ tag }, '已点击标签联想选项');
  await sleep(700);
}

// ====== 可見性 / 原創 / 定時 / 商品 ======

export async function setVisibility(page: Page, visibility?: string): Promise<void> {
  if (!visibility || visibility === '公开可见') return;
  const supported = new Set(['仅自己可见', '仅互关好友可见']);
  if (!supported.has(visibility)) {
    throw new Error(`不支持的可见范围: ${visibility}，支持: 公开可见、仅自己可见、仅互关好友可见`);
  }
  const dropdown = page.locator('div.permission-card-wrapper div.d-select-content').first();
  await dropdown.click();
  await sleep(500);
  const opts = page.locator('div.d-options-wrapper div.d-grid-item div.custom-option');
  const cnt = await opts.count();
  for (let i = 0; i < cnt; i++) {
    const t = ((await opts.nth(i).textContent()) ?? '').trim();
    if (t.includes(visibility)) {
      await opts.nth(i).click();
      logger.info({ visibility }, '已设置可见范围');
      await sleep(200);
      return;
    }
  }
  throw new Error(`未找到可见范围选项: ${visibility}`);
}

export async function setSchedulePublish(page: Page, t: Date): Promise<void> {
  const sw = page.locator('.post-time-wrapper .d-switch').first();
  await sw.click();
  await sleep(800);
  const inputEl = page.locator('.date-picker-container input').first();
  const fmt = formatScheduleTime(t);
  await inputEl.click({ clickCount: 3 });
  await inputEl.fill(fmt);
  logger.info({ datetime: fmt }, '已设置定时时间');
  await sleep(500);
}

function formatScheduleTime(t: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())} ${pad(t.getHours())}:${pad(t.getMinutes())}`;
}

export async function setOriginal(page: Page): Promise<void> {
  const cards = page.locator('div.custom-switch-card');
  const cnt = await cards.count();
  for (let i = 0; i < cnt; i++) {
    const card = cards.nth(i);
    const text = (await card.textContent()) ?? '';
    if (!text.includes('原创声明')) continue;
    const sw = card.locator('div.d-switch').first();
    if ((await sw.count()) === 0) continue;
    const checked = await sw.evaluate((el) => {
      const inp = el.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
      return inp ? inp.checked : false;
    });
    if (checked) {
      logger.info('原创声明已开启');
      return;
    }
    await sw.click();
    await sleep(500);
    await confirmOriginalDeclaration(page);
    logger.info('已开启原创声明');
    return;
  }
  throw new Error('未找到原创声明选项');
}

// 原創聲明彈窗只能用 JS 操作（footer 內含須知 checkbox + 聲明按鈕）
async function confirmOriginalDeclaration(page: Page): Promise<void> {
  await sleep(800);
  const r1 = await page.evaluate(() => {
    const footers = document.querySelectorAll('div.footer');
    for (const f of Array.from(footers)) {
      if (!f.textContent?.includes('原创声明须知')) continue;
      const cb = f.querySelector(
        'div.d-checkbox input[type="checkbox"]',
      ) as HTMLInputElement | null;
      if (cb && !cb.checked) cb.click();
      return 'found_footer';
    }
    return 'footer_not_found';
  });
  if (r1 === 'footer_not_found') logger.warn('未找到原创声明 footer');
  await sleep(500);
  const r2 = await page.evaluate(() => {
    const footers = document.querySelectorAll('div.footer');
    for (const f of Array.from(footers)) {
      if (!f.textContent?.includes('声明原创')) continue;
      const btn = f.querySelector('button.custom-button') as HTMLButtonElement | null;
      if (!btn) continue;
      if (btn.classList.contains('disabled') || btn.disabled) {
        const cb = f.querySelector(
          'div.d-checkbox input[type="checkbox"]',
        ) as HTMLInputElement | null;
        if (cb && !cb.checked) cb.click();
        return 'button_disabled';
      }
      btn.click();
      return 'clicked';
    }
    return 'button_not_found';
  });
  logger.info({ status: r2 }, '原创声明确认结果');
  if (r2 === 'button_not_found') throw new Error('未找到声明原创按钮');
  if (r2 === 'button_disabled') throw new Error('声明原创按钮仍处于禁用状态');
  await sleep(300);
}

// ====== 商品綁定 ======

export async function bindProducts(page: Page, products?: string[]): Promise<void> {
  if (!products || products.length === 0) return;
  logger.info({ products }, '开始绑定商品');

  await clickAddProductButton(page);
  await sleep(1_000);
  const modal = await waitForProductModal(page);
  logger.info('商品选择弹窗已打开');

  const failed: string[] = [];
  for (const kw of products) {
    try {
      await searchAndSelectProduct(page, modal, kw);
    } catch (e) {
      logger.warn({ kw, err: (e as Error).message }, '搜索选择商品失败');
      failed.push(kw);
    }
    await sleep(500);
  }

  await clickModalSaveButton(modal);
  await waitForModalClose(page).catch((e) => logger.warn({ err: e.message }, '等待弹窗关闭超时'));
  if (failed.length > 0) throw new Error(`部分商品未找到: ${failed.join(', ')}`);
  logger.info({ total: products.length }, '商品绑定完成');
  await sleep(1_000);
}

async function clickAddProductButton(page: Page): Promise<void> {
  const spans = page.locator('span.d-text');
  const cnt = await spans.count();
  for (let i = 0; i < cnt; i++) {
    const s = spans.nth(i);
    const t = ((await s.textContent()) ?? '').trim();
    if (t !== '添加商品') continue;
    // 向上找可點擊父元素
    const handle = await s.elementHandle();
    if (!handle) continue;
    const clicked = await handle.evaluate((node) => {
      let cur: HTMLElement | null = node as HTMLElement;
      for (let j = 0; j < 5 && cur; j++) {
        const p: HTMLElement | null = cur.parentElement;
        if (!p) break;
        const tag = p.tagName.toLowerCase();
        const cls = p.getAttribute('class') ?? '';
        if (tag === 'button' || cls.includes('d-button')) {
          (p as HTMLElement).click();
          return true;
        }
        cur = p;
      }
      return false;
    });
    if (clicked) {
      logger.info('已点击添加商品按钮');
      await sleep(300);
      return;
    }
  }
  throw new Error('未找到添加商品按钮，账号可能未开通商品功能');
}

async function waitForProductModal(page: Page): Promise<Locator> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const m = page.locator('.multi-goods-selector-modal').first();
    if ((await m.count()) > 0 && (await m.isVisible())) return m;
    await sleep(100);
  }
  throw new Error('等待商品选择弹窗超时');
}

async function searchAndSelectProduct(page: Page, modal: Locator, keyword: string): Promise<void> {
  logger.info({ keyword }, '搜索商品');
  const searchInput = modal.locator('input[placeholder="搜索商品ID 或 商品名称"]').first();
  await searchInput.click({ clickCount: 3 });
  await searchInput.fill(keyword);
  await sleep(300);
  await page.keyboard.press('Enter');
  await sleep(1_000);

  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const loading = modal.locator('.goods-list-loading').first();
    if ((await loading.count()) === 0 || !(await loading.isVisible())) break;
    await sleep(100);
  }
  while (Date.now() < deadline) {
    const list = modal.locator('.goods-list-normal .good-card-container').first();
    if ((await list.count()) > 0) break;
    await sleep(100);
  }
  await sleep(500);

  const checkbox = modal.locator('.goods-list-normal .good-card-container .d-checkbox').first();
  if ((await checkbox.count()) === 0) throw new Error('未找到商品选择框');
  const isChecked = await checkbox.evaluate(
    (el) =>
      el.querySelector('.d-checkbox-simulator.checked') !== null ||
      el.querySelector('input[type="checkbox"]:checked') !== null,
  );
  if (isChecked) {
    logger.info({ keyword }, '商品已选中，跳过');
    return;
  }
  await checkbox.click();
  const delay = 800 + Math.floor(Math.random() * 700);
  await sleep(delay);
  logger.info({ keyword }, '已选择商品');
}

async function clickModalSaveButton(modal: Locator): Promise<void> {
  const btn = modal.locator('.goods-selected-footer button').first();
  if ((await btn.count()) > 0) {
    try {
      await btn.click();
      logger.info('已点击保存按钮');
      return;
    } catch (e) {
      logger.warn({ err: (e as Error).message }, '点击保存按钮失败');
    }
  }
  const primary = modal.locator('.goods-selected-footer .d-button--primary').first();
  if ((await primary.count()) > 0) {
    await primary.click();
    logger.info('已点击主按钮');
    return;
  }
  logger.warn('未找到保存按钮，继续');
}

async function waitForModalClose(page: Page): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const cnt = await page.locator('.multi-goods-selector-modal').count();
    if (cnt === 0) return;
    await sleep(200);
  }
  throw new Error('等待弹窗关闭超时');
}

// ====== 等待發佈鈕 / 點擊提交 ======

export const PUBLISH_BTN_SEL = '.publish-page-publish-btn button.bg-red';

export async function waitForPublishButtonClickable(page: Page): Promise<Locator> {
  const deadline = Date.now() + 10 * 60_000;
  while (Date.now() < deadline) {
    const btn = page.locator(PUBLISH_BTN_SEL).first();
    if ((await btn.count()) > 0 && (await btn.isVisible())) {
      const disabled = await btn.getAttribute('disabled');
      if (disabled === null) return btn;
    }
    await sleep(1_000);
  }
  throw new Error('等待发布按钮可点击超时');
}

export async function clickSubmit(page: Page): Promise<void> {
  const btn = page.locator(PUBLISH_BTN_SEL).first();
  await btn.click();
  await sleep(3_000);
}
