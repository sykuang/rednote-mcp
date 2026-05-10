import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileTypeFromBuffer } from 'file-type';
import { getImagesPath } from '../config.js';
import { logger } from '../logger.js';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export function isImageURL(p: string): boolean {
  const lower = p.toLowerCase();
  return lower.startsWith('http://') || lower.startsWith('https://');
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function generateFileName(imageURL: string, ext: string): string {
  const hash = crypto.createHash('sha256').update(imageURL).digest('hex').slice(0, 16);
  const ts = Math.floor(Date.now() / 1000);
  return `img_${hash}_${ts}.${ext}`;
}

export async function downloadImage(imageURL: string, savePath?: string): Promise<string> {
  const dir = savePath ?? getImagesPath();
  ensureDir(dir);

  if (!isImageURL(imageURL)) throw new Error(`invalid image URL: ${imageURL}`);

  const u = new URL(imageURL);
  const referer = `${u.protocol}//${u.host}/`;

  const res = await fetch(imageURL, {
    headers: { 'User-Agent': UA, Referer: referer },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`download failed status ${res.status} for ${imageURL}`);

  const buf = Buffer.from(await res.arrayBuffer());
  const ft = await fileTypeFromBuffer(buf);
  if (!ft || !ft.mime.startsWith('image/')) {
    throw new Error('downloaded file is not a valid image');
  }

  const filename = generateFileName(imageURL, ft.ext);
  const fp = path.join(dir, filename);
  if (!fs.existsSync(fp)) fs.writeFileSync(fp, buf);
  return fp;
}

// 處理圖片列表：URL 自動下載，本地路徑直接使用
export async function processImages(images: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const img of images) {
    if (isImageURL(img)) {
      try {
        out.push(await downloadImage(img));
      } catch (e) {
        throw new Error(`下載圖片失敗 ${img}: ${(e as Error).message}`);
      }
    } else {
      out.push(img);
    }
  }
  if (out.length === 0) throw new Error('no valid images found');
  logger.debug({ count: out.length }, 'images processed');
  return out;
}
