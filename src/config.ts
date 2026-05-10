import os from 'node:os';
import path from 'node:path';

// 全域設定（對應 Go configs/）
class Config {
  private headless = true;
  private binPath = '';

  setHeadless(v: boolean): void {
    this.headless = v;
  }
  isHeadless(): boolean {
    return this.headless;
  }

  setBinPath(v: string): void {
    this.binPath = v;
  }
  getBinPath(): string {
    return this.binPath;
  }
}

export const config = new Config();

// 圖片下載目錄
export const IMAGES_DIR = 'rednote_images';
export function getImagesPath(): string {
  return path.join(os.tmpdir(), IMAGES_DIR);
}

// 服務名稱
export const USERNAME = 'rednote-mcp';
