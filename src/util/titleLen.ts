// 計算小紅書標題長度
// 規則：非ASCII字元(中文、全角符號等)算2 byte，ASCII算1 byte，最終 (byteLen+1)/2
// 注意：Go 版本對 UTF-16 code unit 計數，而 JS string 本身就是 UTF-16
export function calcTitleLength(s: string): number {
  let byteLen = 0;
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    byteLen += code > 127 ? 2 : 1;
  }
  return Math.floor((byteLen + 1) / 2);
}
