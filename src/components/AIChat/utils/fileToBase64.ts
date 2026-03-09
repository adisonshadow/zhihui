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
