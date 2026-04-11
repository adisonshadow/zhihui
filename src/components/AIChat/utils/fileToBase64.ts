/**
 * 将 File 转为火山方舟文档要求的 data URL：`data:image/<小写格式>;base64,<payload>`。
 * 裸 base64 会被接口按 URL 解析，易导致 InvalidParameter / invalid url。
 */
export function fileToImageDataUrlForVolc(file: File | undefined | null): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file || !(file instanceof File)) {
      resolve('');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const m = result.match(/^data:([^;]+);base64,(.+)$/i);
      if (!m) {
        resolve('');
        return;
      }
      const mime = m[1].toLowerCase();
      resolve(`data:${mime};base64,${m[2]}`);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** 将 File 转为 base64 字符串（不含 data URL 前缀） */
export function fileToBase64(file: File | undefined | null): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file || !(file instanceof File)) {
      resolve('');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result?.replace(/^data:[^;]+;base64,/, '') ?? '';
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
