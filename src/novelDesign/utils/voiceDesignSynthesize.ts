/**
 * 音色设计试听：MiMo / Qwen（CosyVoice 已停用）
 */
import { fetchRemoteTtsAudio, type TtsEngineOption } from '@/components/tts/ttsModelAdapters';
import {
  createQwenVoiceDesign,
  inferDashscopeVoiceDesignKind,
  resolveDashscopeVoiceDesignTargetModel,
} from '@/components/tts/providers/dashscopeVoiceDesign';
import {
  isDashscopeVoiceDesignEngine,
  isMimoVoiceDesignEngine,
  isMinimaxVoiceDesignEngine,
} from '@/components/tts/voiceCapabilityInference';
import { createMinimaxVoiceDesign } from '@/components/tts/providers/minimaxVoiceDesign';
import { resolveRequestModelId } from '@/utils/aiModelRequestId';

export type VoiceDesignPreviewResult =
  | {
      ok: true;
      arrayBuffer: ArrayBuffer;
      ext: string;
      /** DashScope 设计返回的 voice / voice_id，绑定大纲 cloud 字段用 */
      cloudVoiceId?: string;
      targetModel?: string;
    }
  | { ok: false; error: string };

export type VoiceDesignLimits = {
  previewTextMax: number;
  voicePromptMax: number;
};

export function voiceDesignLimitsForEngine(engine: TtsEngineOption): VoiceDesignLimits {
  if (isMimoVoiceDesignEngine(engine)) {
    return { previewTextMax: 100, voicePromptMax: 2000 };
  }
  if (isMinimaxVoiceDesignEngine(engine)) {
    return { previewTextMax: 500, voicePromptMax: 2000 };
  }
  const m = engine.modelConfig;
  const kind = m ? inferDashscopeVoiceDesignKind(m) : null;
  if (kind === 'qwen') {
    return { previewTextMax: 1024, voicePromptMax: 2048 };
  }
  return { previewTextMax: 1024, voicePromptMax: 2048 };
}

export async function synthesizeVoiceDesignPreview(opts: {
  engine: TtsEngineOption;
  voiceDescription: string;
  previewText: string;
  previewSceneLabel?: string;
  voicePrefix?: string;
  preferredName?: string;
}): Promise<VoiceDesignPreviewResult> {
  const vd = opts.voiceDescription.trim();
  const pt = opts.previewText.trim();
  if (!vd) return { ok: false, error: '音色描述不能为空' };
  if (!pt) return { ok: false, error: '试听文本不能为空' };

  const limits = voiceDesignLimitsForEngine(opts.engine);
  if (vd.length > limits.voicePromptMax) {
    return { ok: false, error: `音色描述不能超过 ${limits.voicePromptMax} 字` };
  }
  if (pt.length > limits.previewTextMax) {
    return { ok: false, error: `试听文本不能超过 ${limits.previewTextMax} 字` };
  }

  if (isMimoVoiceDesignEngine(opts.engine)) {
    const params: Record<string, unknown> = {
      format: 'wav',
      mimoEffectiveModelId:
        (opts.engine.modelConfig ? resolveRequestModelId(opts.engine.modelConfig) : undefined) ??
        'mimo-v2.5-tts-voicedesign',
      mimoVoiceDesignPrompt: vd,
      mimoPreformattedAssistant: true,
      mimoAudioTagSupported: false,
    };
    const label = opts.previewSceneLabel?.trim();
    if (label) params.mimoDirectorUserContent = `试读场景：${label}`;
    const synth = await fetchRemoteTtsAudio(opts.engine, pt, params);
    if (!synth.ok) return synth;
    return { ok: true, arrayBuffer: synth.arrayBuffer, ext: synth.ext };
  }

  if (isDashscopeVoiceDesignEngine(opts.engine)) {
    const m = opts.engine.modelConfig;
    if (!m?.apiKey?.trim()) return { ok: false, error: '模型 API Key 未配置' };
    const targetModel = resolveDashscopeVoiceDesignTargetModel(m);
    if (!targetModel) return { ok: false, error: '无法解析 target_model' };
    const kind = inferDashscopeVoiceDesignKind(m);
    if (!kind) return { ok: false, error: '无法识别 DashScope 声音设计类型' };

    const created = await createQwenVoiceDesign({
      apiKey: m.apiKey,
      targetModel,
      voicePrompt: vd,
      previewText: pt,
      preferredName: opts.preferredName,
    });

    if (!created.ok) return created;
    const ext =
      created.responseFormat === 'mp3' ? '.mp3'
      : created.responseFormat === 'pcm' ? '.pcm'
      : '.wav';
    return {
      ok: true,
      arrayBuffer: created.previewArrayBuffer,
      ext,
      cloudVoiceId: created.voiceId,
      targetModel: created.targetModel || targetModel,
    };
  }

  if (isMinimaxVoiceDesignEngine(opts.engine)) {
    const m = opts.engine.modelConfig;
    if (!m?.apiKey?.trim()) return { ok: false, error: '模型 API Key 未配置' };
    if (!(m.minimaxGroupId ?? '').trim()) {
      return { ok: false, error: 'MiniMax 音色设计需在设置 → AI 模型 → MiniMax Speech 填写 GroupId' };
    }
    const created = await createMinimaxVoiceDesign({
      model: m,
      prompt: vd,
      previewText: pt,
      voiceId: opts.voicePrefix?.trim() || undefined,
    });
    if (!created.ok) return created;
    const ext = created.responseFormat === 'mp3' ? '.mp3' : '.wav';
    return {
      ok: true,
      arrayBuffer: created.previewArrayBuffer,
      ext,
      cloudVoiceId: created.voiceId,
    };
  }

  return { ok: false, error: '不支持的音色设计引擎' };
}

/** @deprecated 使用 synthesizeVoiceDesignPreview */
export async function synthesizeMimoVoiceDesignPreview(opts: {
  engine: TtsEngineOption;
  voiceDescription: string;
  previewText: string;
  previewSceneLabel?: string;
}): Promise<{ ok: true; arrayBuffer: ArrayBuffer; ext: string } | { ok: false; error: string }> {
  const r = await synthesizeVoiceDesignPreview(opts);
  if (!r.ok) return r;
  return { ok: true, arrayBuffer: r.arrayBuffer, ext: r.ext };
}
