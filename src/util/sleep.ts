export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 在 [minMs, maxMs] 之間隨機休眠
export function sleepRandom(minMs: number, maxMs: number): Promise<void> {
  if (maxMs <= minMs) return sleep(minMs);
  const delay = minMs + Math.floor(Math.random() * (maxMs - minMs));
  return sleep(delay);
}
