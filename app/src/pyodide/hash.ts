/** djb2 内容指纹：用于派生渲染器内部的临时文件路径与缓存键（前后端保持一致） */
export function contentHash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = (((h << 5) + h) ^ text.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
