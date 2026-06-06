/**
 * MiniMax 音色复刻：files/upload → voice_clone → 自定义 voice_id
 * 文档：https://platform.minimaxi.com/docs/guides/speech-voice-clone
 */
import type { AIModelConfig } from '@/types/settings';
import { resolveRequestModelId } from '@/utils/aiModelRequestId';
import {
  minimaxApiBase,
  minimaxGroupIdFromModel,
  normalizeMinimaxApiKey,
} from '@/components/tts/providers/minimaxApiUtils';

function dataUrlToBlob(dataUrl: string): Blob {
  const m = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl.trim());
  if (!m) throw new Error('无效的 data URL');
  const mime = m[1];
  const b64 = m[2];
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function fileNameFromPath(p: string): string {
  const parts = p.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || 'voice_sample.wav';
}

async function uploadVoiceCloneFile(
  model: AIModelConfig,
  audioPath: string,
): Promise<{ ok: true; fileId: number } | { ok: false; error: string }> {
  const read = window.yiman?.fs?.readFileAsDataUrl;
  if (!read) return { ok: false, error: '当前环境无法读取本地音色文件' };
  const dataUrl = await read(audioPath);
  if (!dataUrl?.startsWith('data:')) {
    return { ok: false, error: '读取参考音频失败（需 wav/mp3）' };
  }

  let blob: Blob;
  try {
    blob = dataUrlToBlob(dataUrl);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  const apiKey = normalizeMinimaxApiKey(model.apiKey ?? '');
  if (!apiKey) return { ok: false, error: '缺少 MiniMax API Key' };

  let groupId: string;
  try {
    groupId = minimaxGroupIdFromModel(model);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  const form = new FormData();
  form.append('purpose', 'voice_clone');
  form.append('file', blob, fileNameFromPath(audioPath));

  const url = `${minimaxApiBase(model)}/files/upload?GroupId=${encodeURIComponent(groupId)}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    const json = (await res.json()) as {
      file?: { file_id?: number };
      base_resp?: { status_code?: number; status_msg?: string };
    };
    const code = json.base_resp?.status_code;
    if (code !== undefined && code !== 0) {
      return { ok: false, error: json.base_resp?.status_msg ?? `MiniMax 上传错误码 ${code}` };
    }
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }
    const fileId = json.file?.file_id;
    if (typeof fileId !== 'number') {
      return { ok: false, error: 'MiniMax 上传响应缺少 file.file_id' };
    }
    return { ok: true, fileId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function cloneMinimaxVoice(params: {
  model: AIModelConfig;
  audioPath: string;
  customVoiceId: string;
  previewText?: string;
}): Promise<{ ok: true; voiceId: string; fileId: number } | { ok: false; error: string }> {
  const upload = await uploadVoiceCloneFile(params.model, params.audioPath);
  if (!upload.ok) return upload;

  const apiKey = normalizeMinimaxApiKey(params.model.apiKey ?? '');
  let groupId: string;
  try {
    groupId = minimaxGroupIdFromModel(params.model);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  const voiceId = params.customVoiceId.trim();
  if (!voiceId) return { ok: false, error: 'MiniMax 自定义 voice_id 不能为空' };

  const modelSlug = (resolveRequestModelId(params.model) ?? 'speech-2.8-hd').trim();
  const url = `${minimaxApiBase(params.model)}/voice_clone?GroupId=${encodeURIComponent(groupId)}`;

  const body: Record<string, unknown> = {
    file_id: upload.fileId,
    voice_id: voiceId,
    model: modelSlug,
  };
  const preview = params.previewText?.trim();
  if (preview) body.text = preview;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as {
      base_resp?: { status_code?: number; status_msg?: string };
    };
    const code = json.base_resp?.status_code;
    if (code !== undefined && code !== 0) {
      return { ok: false, error: json.base_resp?.status_msg ?? `MiniMax 克隆错误码 ${code}` };
    }
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }
    return { ok: true, voiceId, fileId: upload.fileId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 由路径生成稳定 custom voice_id（MiniMax 要求自定义 id） */
export function minimaxVoiceIdFromSource(sourceKey: string, prefix = 'yiman'): string {
  const safe = sourceKey.replace(/[^a-zA-Z0-9_-]/g, '_').slice(-48);
  return `${prefix}_${safe}`.slice(0, 64);
}
