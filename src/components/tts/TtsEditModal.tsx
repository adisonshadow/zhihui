/**
 * 通用 TTS 编辑 Modal：引擎选择、文本与参数、生成并写入项目素材；波形区参考声音素材 AudioPreviewDrawer
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Select,
  Input,
  Button,
  Space,
  Typography,
  App,
  theme,
  AutoComplete,
  Checkbox,
  InputNumber,
} from 'antd';
import { PlayCircleOutlined, PauseCircleOutlined, SoundOutlined } from '@ant-design/icons';
import WavesurferPlayer from '@wavesurfer/react';
import type { SceneContentItem, SceneContentItemTtsState } from '@/types/script';
import { useConfigSubscribe } from '@/contexts/ConfigContext';
import {
  buildVoiceOverEngineList,
  getEngineById,
  mergeParamsForItem,
  generateTtsBase64ForEngine,
  resolveVoiceOverEngineId,
  type TtsEngineOption,
} from './ttsModelAdapters';
import { MIMO_V25_PRESET_VOICE_IDS } from '@/components/tts/mimoV25PresetVoices';
import { buildMimoAssistantContentForTts } from './ttsModelAdapters';
import { resolveRequestModelId } from '@/utils/aiModelRequestId';
// CosyVoice 已停用
// import { isCosyVoiceV35ModelId, resolveCosyVoiceModelSlug } from '@/components/tts/cosyVoiceModelUtils';
import {
  TtsVoiceSourceFields,
  minimaxPresetVoiceControl,
} from '@/components/tts/TtsVoiceSourceFields';

const { Text, Link } = Typography;
const { TextArea } = Input;

const OPENAI_VOICE_PRESETS = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'] as const;
const OPENAI_SPEED_OPTIONS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4] as const;
const MINIMAX_SAMPLE_RATES = [16000, 24000, 32000, 44100] as const;
const MINIMAX_BITRATES = [32000, 64000, 128000, 256000] as const;

/** 旁白叙述视角，与剧本面板一致；映射为 MiMo 导演模式的人设/语气上下文 */
const NARRATOR_STYLE_OPTIONS: { label: string; value: string }[] = [
  { label: '全知', value: '全知' },
  { label: '第一人称主角', value: '第一人称主角' },
  { label: '第一人称配角', value: '第一人称配角' },
];

export interface TtsEditModalProps {
  open: boolean;
  onClose: () => void;
  projectDir: string;
  /** 剧本内容项 id（用于素材描述与缓存键） */
  contentItemId: string;
  item: SceneContentItem;
  characters: { id: string; name: string; tts_voice?: string | null; tts_speed?: number | null }[];
  onPersistTts: (itemId: string, tts: SceneContentItemTtsState) => void;
}

export function TtsEditModal({
  open,
  onClose,
  projectDir,
  contentItemId,
  item,
  characters,
  onPersistTts,
}: TtsEditModalProps) {
  const { message } = App.useApp();
  const { token } = theme.useToken();
  const config = useConfigSubscribe();
  const models = config?.models ?? [];

  const engines = useMemo(() => buildVoiceOverEngineList(models), [models]);

  const [text, setText] = useState('');
  const [engineId, setEngineId] = useState('');
  const [params, setParams] = useState<Record<string, unknown>>({});
  const [generating, setGenerating] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const wavesurferRef = useRef<{ playPause: () => void } | null>(null);
  const shouldAutoPlayRef = useRef(false);

  const activeEngine = useMemo(
    () => (engineId ? getEngineById(models, engineId) : undefined) ?? engines[0],
    [models, engineId, engines]
  );

  const mimoRequestSlug = activeEngine?.modelConfig ?
    resolveRequestModelId(activeEngine.modelConfig) ?? ''
  : '';

  const mimoAssistPreview = useMemo(() => {
    if (activeEngine?.adapterKind !== 'xiaomi_mimo_chat_audio') return '';
    let eff = '';
    const lo = mimoRequestSlug.toLowerCase();
    if (lo.includes('voiceclone')) eff = 'mimo-v2.5-tts-voiceclone';
    else if (lo.includes('voicedesign')) eff = 'mimo-v2.5-tts-voicedesign';
    else eff = 'mimo-v2.5-tts';
    try {
      return buildMimoAssistantContentForTts(text, {
        ...params,
        mimoEffectiveModelId: eff,
      }).trim();
    } catch {
      return '';
    }
  }, [activeEngine?.adapterKind, mimoRequestSlug, params, text]);

  useEffect(() => {
    if (!open) {
      setPreviewUrl(null);
      shouldAutoPlayRef.current = false;
      return;
    }
    setText(item.text ?? '');
    const resolved = resolveVoiceOverEngineId(item.tts?.engineId, models);
    setEngineId(resolved);
  }, [open, item.id, item.text, item.tts?.engineId, models]);

  useEffect(() => {
    if (!open) return;
    const eng = engineId ? getEngineById(models, engineId) : engines[0];
    if (!eng) return;
    setParams(mergeParamsForItem(item, eng, characters));
  }, [open, engineId, models, engines, item, characters]);

  useEffect(() => {
    if (!open) return;
    const path = item.tts?.audioPath;
    if (!path || !window.yiman?.project?.getAssetDataUrl) {
      setPreviewUrl(null);
      return;
    }
    let cancelled = false;
    shouldAutoPlayRef.current = !!(item.tts?.audioPath && item.text?.trim());
    void window.yiman.project.getAssetDataUrl(projectDir, path).then((url) => {
      if (!cancelled) setPreviewUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [open, projectDir, item.tts?.audioPath, item.tts?.updatedAt]);

  const noEngines = engines.length === 0;

  const handleGenerate = async () => {
    if (noEngines) {
      message.warning('请先在「设置」中添加具备「生成配音」能力的模型');
      return;
    }
    const eng = getEngineById(models, engineId) ?? engines[0];
    if (!eng) {
      message.error('未找到所选引擎');
      return;
    }
    const trimmed = text.trim();
    if (!trimmed) {
      message.warning('请先填写要合成的文本');
      return;
    }
    setGenerating(true);
    try {
      const gen = await generateTtsBase64ForEngine(eng, trimmed, params);
      if (!gen.ok) {
        message.error(gen.error);
        return;
      }
      const api = window.yiman?.project;
      if (!api?.saveAssetFromBase64) {
        message.error('保存素材接口不可用');
        return;
      }
      const replaceId = item.tts?.assetId;
      const save = await api.saveAssetFromBase64(projectDir, gen.base64, gen.ext, 'music', {
        replaceAssetId: replaceId,
      });
      if (!save.ok || !save.path || !save.id) {
        message.error(save.error || '保存失败');
        return;
      }
      await api.updateAsset?.(projectDir, save.id, {
        description: `剧本TTS ${contentItemId}`,
      });
      const next: SceneContentItemTtsState = {
        engineId: eng.engineId,
        params: { ...params },
        assetId: save.id,
        audioPath: save.path,
        updatedAt: Date.now(),
      };
      onPersistTts(contentItemId, next);
      message.success('已生成并保存');
      const url = await api.getAssetDataUrl(projectDir, save.path);
      setPreviewUrl(url);
      shouldAutoPlayRef.current = true;
    } finally {
      setGenerating(false);
    }
  };

  const renderParamFields = (eng: TtsEngineOption | undefined) => {
    if (!eng) return null;
    if (eng.adapterKind === 'xiaomi_mimo_chat_audio') {
      const voiceVal =
        typeof params.voice === 'string' && params.voice.trim() ? params.voice.trim() : '茉莉';
      const fmt = typeof params.format === 'string' ? params.format : 'mp3';
      const roleVal = typeof params.mimoStyleRole === 'string' ? params.mimoStyleRole : '';
      const emoVal = typeof params.emotion === 'string' ? params.emotion : '';
      const lo = mimoRequestSlug.toLowerCase();
      const isClone = lo.includes('voiceclone');
      const isDesign = lo.includes('voicedesign');
      const cloneUrl = typeof params.mimoVoiceCloneDataUrl === 'string' ? params.mimoVoiceCloneDataUrl : '';

      const syncRoleAndTone = (v: string) =>
        setParams((p) => ({ ...p, mimoStyleRole: v, ttsTone: v }));

      const roleControl =
        item.type === 'narration' ? (
          <Select
            style={{ width: 160 }}
            value={roleVal || '全知'}
            onChange={(v) => syncRoleAndTone((v as string) || '')}
            options={NARRATOR_STYLE_OPTIONS}
          />
        ) : item.type === 'dialogue' ? (
          <AutoComplete
            style={{ width: 180 }}
            value={roleVal}
            onChange={(v) => syncRoleAndTone(typeof v === 'string' ? v : '')}
            options={characters.map((c) => ({
              value: (c.name?.trim() || c.id) as string,
              label: (c.name?.trim() || c.id) as string,
            }))}
            placeholder="角色 / 说话人"
            allowClear
          />
        ) : (
          <Input
            style={{ width: 180 }}
            value={roleVal}
            onChange={(e) => syncRoleAndTone(e.target.value)}
            placeholder="语气提示，如 孙悟空"
            allowClear
          />
        );

      return (
        <Space orientation="vertical" style={{ width: '100%' }} size="small">
          <Text type="secondary" style={{ fontSize: 12 }}>
            MiMo V2.5：上方「合成文本」进入 API 的 <code style={{ fontSize: 11 }}>assistant.content</code>
            （自动补充整体风格括号、inline 停顿等）；模型 <code style={{ fontSize: 11 }}>user</code>{' '}
            侧为导演模式与音色描述。禁止 <code style={{ fontSize: 11 }}>role=system</code>。有声书会在工作台按「故事大纲」
            wav 自动克隆；此处「克隆参考」仅供剧本单条试音粘贴 <code style={{ fontSize: 11 }}>data:audio/…;base64,…</code>。
          </Text>
          <Space wrap style={{ width: '100%' }} align="center">
            <Text type="secondary">语气/人设</Text>
            {roleControl}
            <Text type="secondary">情绪</Text>
            <Input
              style={{ width: 120 }}
              placeholder="如 开心、怅然"
              value={emoVal}
              onChange={(e) =>
                setParams((p) => ({ ...p, emotion: e.target.value.trim() ? e.target.value : undefined }))
              }
              allowClear
            />
          </Space>
          {!isClone ?
            <Space wrap style={{ width: '100%' }} align="center">
              <Text type="secondary">预置音色（非克隆时）</Text>
              <AutoComplete
                style={{ width: 220 }}
                value={voiceVal}
                onChange={(v) => setParams((p) => ({ ...p, voice: typeof v === 'string' ? v : '茉莉' }))}
                options={[...MIMO_V25_PRESET_VOICE_IDS].map((v) => ({ value: v, label: v }))}
                placeholder="如 茉莉 / Chloe"
                allowClear
              />
            </Space>
          : null}
          <Space wrap style={{ width: '100%' }} align="center">
            <Text type="secondary">格式</Text>
            <Select
              style={{ width: 100 }}
              value={fmt}
              onChange={(v) => setParams((p) => ({ ...p, format: v }))}
              options={[
                { value: 'mp3', label: 'mp3' },
                { value: 'wav', label: 'wav' },
                { value: 'pcm', label: 'pcm' },
              ]}
            />
          </Space>
          {isClone ?
            <div style={{ width: '100%' }}>
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                音色克隆参考（完整 data-url，≤10MB）
              </Text>
              <TextArea
                rows={3}
                placeholder="data:audio/wav;base64,xxxx 或 data:audio/mpeg;base64,xxxx"
                value={cloneUrl}
                onChange={(e) => {
                  const v = e.target.value.trim();
                  setParams((p) => ({ ...p, mimoVoiceCloneDataUrl: v === '' ? undefined : v }));
                }}
              />
            </div>
          : null}
          {isDesign ?
            <Checkbox
              checked={params.mimoOptimizeTextPreview === true}
              onChange={(e) =>
                setParams((p) => ({ ...p, mimoOptimizeTextPreview: e.target.checked ? true : undefined }))
              }
            >
              开启 optimize_text_preview（可省略下方合成文本，由服务端润色）
            </Checkbox>
          : null}
          <div style={{ width: '100%' }}>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
              附加 user 指令（导演模式补充，接在自动导演块之后）
            </Text>
            <TextArea
              rows={2}
              placeholder="如：语速更慢、尾音带气声、句间留白更长…"
              value={typeof params.mimoUserPrompt === 'string' ? params.mimoUserPrompt : ''}
              onChange={(e) => {
                const v = e.target.value;
                setParams((p) => ({ ...p, mimoUserPrompt: v === '' ? undefined : v }));
              }}
            />
          </div>
          <div style={{ width: '100%' }}>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
              旧版「身份说明」（可选；会并入 user 块头部，一般用不到）
            </Text>
            <TextArea
              rows={2}
              value={typeof params.mimoSystemPrompt === 'string' ? params.mimoSystemPrompt : ''}
              onChange={(e) => {
                const v = e.target.value;
                setParams((p) => ({ ...p, mimoSystemPrompt: v === '' ? undefined : v }));
              }}
            />
          </div>
          <div style={{ width: '100%' }}>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
              Enrich 预览（实际请求的 assistant.content）
            </Text>
            <TextArea rows={4} readOnly value={mimoAssistPreview} style={{ fontFamily: token.fontFamily }} />
          </div>
        </Space>
      );
    }
    if (eng.adapterKind === 'minimax_t2a_v2') {
      const voiceVal = typeof params.voice === 'string' ? params.voice : 'male-qn-qingse';
      const fmt = typeof params.format === 'string' ? params.format : 'mp3';
      const emoVal = typeof params.emotion === 'string' ? params.emotion : 'happy';
      const toneStr =
        typeof params.minimax_tone_dict === 'string'
          ? params.minimax_tone_dict
          : Array.isArray(params.minimax_tone_dict)
            ? (params.minimax_tone_dict as string[]).join('\n')
            : '';
      return (
        <Space orientation="vertical" style={{ width: '100%' }} size="small">
          <TtsVoiceSourceFields
            adapterLabel="MiniMax Speech"
            params={params}
            onChange={(patch) => setParams((p) => ({ ...p, ...patch }))}
            presetVoiceControl={minimaxPresetVoiceControl(voiceVal, (v) =>
              setParams((p) => ({ ...p, voice: v || '' })),
            )}
          />
          <Text type="secondary" style={{ fontSize: 12 }}>
            同步 HTTP{' '}
            <Link
              href="https://platform.minimaxi.com/docs/api-reference/speech-t2a-http"
              target="_blank"
              rel="noreferrer"
            >
              speech-t2a-http
            </Link>
            ；复刻需在「设置 → AI 模型 → MiniMax Speech」填写 GroupId。
          </Text>
          <Space wrap style={{ width: '100%' }} align="center">
            <Text type="secondary">语速</Text>
            <InputNumber
              min={0.5}
              max={2}
              step={0.1}
              style={{ width: 88 }}
              value={typeof params.speed === 'number' ? params.speed : 1}
              onChange={(v) => setParams((p) => ({ ...p, speed: typeof v === 'number' ? v : 1 }))}
            />
            <Text type="secondary">音量</Text>
            <InputNumber
              min={0.1}
              max={10}
              step={0.1}
              style={{ width: 88 }}
              value={typeof params.vol === 'number' ? params.vol : 1}
              onChange={(v) => setParams((p) => ({ ...p, vol: typeof v === 'number' ? v : 1 }))}
            />
            <Text type="secondary">音高</Text>
            <InputNumber
              min={-12}
              max={12}
              step={1}
              style={{ width: 88 }}
              value={typeof params.pitch === 'number' ? params.pitch : 0}
              onChange={(v) => setParams((p) => ({ ...p, pitch: typeof v === 'number' ? v : 0 }))}
            />
            <Text type="secondary">情绪 emotion</Text>
            <Input
              style={{ width: 120 }}
              value={emoVal}
              onChange={(e) =>
                setParams((p) => ({ ...p, emotion: e.target.value.trim() ? e.target.value : 'happy' }))
              }
              placeholder="如 happy"
            />
          </Space>
          <Space wrap style={{ width: '100%' }} align="center">
            <Text type="secondary">采样率</Text>
            <Select
              style={{ width: 120 }}
              value={typeof params.minimax_sample_rate === 'number' ? params.minimax_sample_rate : 32000}
              onChange={(v) => setParams((p) => ({ ...p, minimax_sample_rate: v }))}
              options={MINIMAX_SAMPLE_RATES.map((n) => ({ label: String(n), value: n }))}
            />
            <Text type="secondary">比特率</Text>
            <Select
              style={{ width: 120 }}
              value={typeof params.minimax_bitrate === 'number' ? params.minimax_bitrate : 128000}
              onChange={(v) => setParams((p) => ({ ...p, minimax_bitrate: v }))}
              options={MINIMAX_BITRATES.map((n) => ({ label: String(n), value: n }))}
            />
            <Text type="secondary">声道</Text>
            <Select
              style={{ width: 72 }}
              value={typeof params.minimax_channel === 'number' ? params.minimax_channel : 1}
              onChange={(v) => setParams((p) => ({ ...p, minimax_channel: v }))}
              options={[
                { value: 1, label: '1' },
                { value: 2, label: '2' },
              ]}
            />
            <Text type="secondary">格式</Text>
            <Select
              style={{ width: 88 }}
              value={fmt}
              onChange={(v) => setParams((p) => ({ ...p, format: v }))}
              options={[
                { value: 'mp3', label: 'mp3' },
                { value: 'wav', label: 'wav' },
                { value: 'pcm', label: 'pcm' },
              ]}
            />
          </Space>
          <Checkbox
            checked={params.subtitle_enable === true}
            onChange={(e) => setParams((p) => ({ ...p, subtitle_enable: e.target.checked }))}
          >
            subtitle_enable（字幕相关返回）
          </Checkbox>
          <div style={{ width: '100%' }}>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
              pronunciation_dict.tone（每行一条，或 JSON：{`{"tone":["处理/(chu3)(li3)"]}`}）
            </Text>
            <TextArea
              rows={2}
              placeholder={'处理/(chu3)(li3)\n危险/dangerous'}
              value={toneStr}
              onChange={(e) =>
                setParams((p) => ({
                  ...p,
                  minimax_tone_dict: e.target.value.trim() ? e.target.value : undefined,
                }))
              }
            />
          </div>
        </Space>
      );
    }
    if (eng.adapterKind === 'qwen3_tts_dashscope') {
      const voiceVal = typeof params.voice === 'string' ? params.voice : 'Cherry';
      const lang =
        typeof params.qwen_language_type === 'string' ? params.qwen_language_type : 'Chinese';
      return (
        <Space orientation="vertical" style={{ width: '100%' }} size="small">
          <TtsVoiceSourceFields
            adapterLabel="Qwen3-TTS"
            params={params}
            onChange={(patch) => setParams((p) => ({ ...p, ...patch }))}
            presetVoiceControl={
              <Space wrap align="center">
                <Text type="secondary">预置 voice</Text>
                <Input
                  style={{ width: 200 }}
                  value={voiceVal}
                  onChange={(e) => setParams((p) => ({ ...p, voice: e.target.value }))}
                  placeholder="如 Cherry"
                />
              </Space>
            }
          />
          <Space wrap align="center">
            <Text type="secondary">language_type</Text>
            <Input
              style={{ width: 160 }}
              value={lang}
              onChange={(e) => setParams((p) => ({ ...p, qwen_language_type: e.target.value }))}
            />
          </Space>
        </Space>
      );
    }
    // CosyVoice 已停用
    /*
    if (eng.adapterKind === 'cosyvoice_dashscope_ws') {
      ...
    }
    */
    if (eng.adapterKind === 'openai_audio_speech') {
      const voiceVal = typeof params.voice === 'string' ? params.voice : 'alloy';
      return (
        <Space wrap style={{ width: '100%' }}>
          <Text type="secondary">音色 voice</Text>
          <AutoComplete
            style={{ width: 200 }}
            value={voiceVal}
            onChange={(v) => setParams((p) => ({ ...p, voice: v }))}
            options={OPENAI_VOICE_PRESETS.map((v) => ({ value: v, label: v }))}
            placeholder="OpenAI 或兼容服务音色名"
            allowClear
          />
          <Text type="secondary">语速</Text>
          <Select
            style={{ width: 120 }}
            value={typeof params.speed === 'number' ? params.speed : 1}
            onChange={(v) => setParams((p) => ({ ...p, speed: v }))}
            options={OPENAI_SPEED_OPTIONS.map((n) => ({ label: String(n), value: n }))}
          />
        </Space>
      );
    }
    return (
      <Space orientation="vertical" style={{ width: '100%' }} size="small">
        <Space wrap>
          <Text type="secondary">voice</Text>
          <Input
            style={{ width: 140 }}
            value={typeof params.voice === 'string' ? params.voice : ''}
            onChange={(e) => setParams((p) => ({ ...p, voice: e.target.value }))}
          />
          <Text type="secondary">语速</Text>
          <Select
            style={{ width: 120 }}
            value={typeof params.speed === 'number' ? params.speed : 1}
            onChange={(v) => setParams((p) => ({ ...p, speed: v }))}
            options={OPENAI_SPEED_OPTIONS.map((n) => ({ label: String(n), value: n }))}
          />
        </Space>
        <Text type="secondary" style={{ fontSize: 12 }}>
          额外 JSON 会合并进请求 body（适配自建网关）
        </Text>
        <TextArea
          rows={3}
          placeholder='例如 {"style":"calm"}'
          value={typeof params.extraJson === 'string' ? params.extraJson : ''}
          onChange={(e) => setParams((p) => ({ ...p, extraJson: e.target.value }))}
        />
      </Space>
    );
  };

  return (
    <Modal
      title={
        <Space>
          <SoundOutlined />
          <span>TTS 配音</span>
        </Space>
      }
      open={open}
      onCancel={onClose}
      width={640}
      footer={[
        <Button key="close" onClick={onClose}>
          关闭
        </Button>,
        <Button
          key="gen"
          type="primary"
          loading={generating}
          disabled={noEngines}
          onClick={() => void handleGenerate()}
        >
          生成配音
        </Button>,
      ]}
      destroyOnHidden
    >
      <Space orientation="vertical" style={{ width: '100%' }} size="middle">
        {noEngines ? (
          <Text type="warning">请先在「设置」的常见模型中选择「小米 MiMo TTS」或其它具备「生成配音」能力的模型并完成配置。</Text>
        ) : null}
        <div>
          <Text type="secondary">TTS 引擎</Text>
          <Select
            style={{ width: '100%', marginTop: 6 }}
            value={noEngines ? undefined : engineId || engines[0]?.engineId}
            onChange={(v) => setEngineId(v)}
            disabled={noEngines}
            options={engines.map((e) => ({ label: e.label, value: e.engineId }))}
          />
        </div>
        <div>
          <Text type="secondary">文本</Text>
          <TextArea style={{ marginTop: 6 }} rows={4} value={text} onChange={(e) => setText(e.target.value)} />
          {activeEngine?.adapterKind === 'xiaomi_mimo_chat_audio' ? (
            <Text type="secondary" style={{ fontSize: 12, marginTop: 6, display: 'block' }}>
              以上内容写入请求中的 <code style={{ fontSize: 11 }}>assistant.content</code>（并与「角色」「情绪」生成的{' '}
              <code style={{ fontSize: 11 }}>&lt;style&gt;…&lt;/style&gt;</code> 拼接，见小米 speech-synthesis）。
            </Text>
          ) : null}
          {activeEngine?.adapterKind === 'minimax_t2a_v2' ? (
            <Text type="secondary" style={{ fontSize: 12, marginTop: 6, display: 'block' }}>
              speech-2.8 等模型可在正文插入语气词标签，例如 <code style={{ fontSize: 11 }}>(laughs)</code>，详见 MiniMax
              文档。
            </Text>
          ) : null}
        </div>
        {renderParamFields(activeEngine)}
        <div
          style={{
            padding: 16,
            borderRadius: 8,
            background: token.colorFillTertiary ?? 'rgba(255,255,255,0.06)',
          }}
        >
          <Text strong style={{ display: 'block', marginBottom: 8 }}>
            最近一次生成
          </Text>
          {previewUrl ? (
            <Space orientation="vertical" style={{ width: '100%' }} size="small">
              <WavesurferPlayer
                key={previewUrl}
                height={72}
                waveColor="rgba(255,255,255,0.35)"
                progressColor="rgba(100,150,255,0.85)"
                url={previewUrl}
                onReady={(ws) => {
                  wavesurferRef.current = ws;
                  if (shouldAutoPlayRef.current) {
                    shouldAutoPlayRef.current = false;
                    try {
                      ws.play();
                    } catch {
                      /* ignore */
                    }
                  }
                }}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
              />
              <Button
                type="primary"
                size="small"
                icon={isPlaying ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                onClick={() => wavesurferRef.current?.playPause?.()}
              >
                {isPlaying ? '暂停' : '播放'}
              </Button>
            </Space>
          ) : (
            <Text type="secondary">尚无缓存，生成后将在此预览</Text>
          )}
        </div>
      </Space>
    </Modal>
  );
}
