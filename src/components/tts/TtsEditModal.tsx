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
import { MINIMAX_VOICE_AUTOCOMPLETE_OPTIONS } from './minimaxSystemVoices';

const { Text, Link } = Typography;
const { TextArea } = Input;

const OPENAI_VOICE_PRESETS = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'] as const;
const MIMO_VOICE_PRESETS = ['default_zh', 'default_en', 'mimo_default'] as const;
const OPENAI_SPEED_OPTIONS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4] as const;
const MINIMAX_SAMPLE_RATES = [16000, 24000, 32000, 44100] as const;
const MINIMAX_BITRATES = [32000, 64000, 128000, 256000] as const;

/** 旁白叙述视角，与剧本面板一致；写入 MiMo &lt;style&gt; 的「角色」侧 */
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
      const voiceVal = typeof params.voice === 'string' ? params.voice : 'default_zh';
      const fmt = typeof params.format === 'string' ? params.format : 'mp3';
      const roleVal = typeof params.mimoStyleRole === 'string' ? params.mimoStyleRole : '';
      const emoVal = typeof params.emotion === 'string' ? params.emotion : '';

      const roleControl =
        item.type === 'narration' ? (
          <Select
            style={{ width: 140 }}
            value={roleVal || '全知'}
            onChange={(v) => setParams((p) => ({ ...p, mimoStyleRole: (v as string) || '' }))}
            options={NARRATOR_STYLE_OPTIONS}
          />
        ) : item.type === 'dialogue' ? (
          <AutoComplete
            style={{ width: 160 }}
            value={roleVal}
            onChange={(v) => setParams((p) => ({ ...p, mimoStyleRole: typeof v === 'string' ? v : '' }))}
            options={characters.map((c) => ({
              value: (c.name?.trim() || c.id) as string,
              label: (c.name?.trim() || c.id) as string,
            }))}
            placeholder="角色 / 说话人"
            allowClear
          />
        ) : (
          <Input
            style={{ width: 160 }}
            value={roleVal}
            onChange={(e) => setParams((p) => ({ ...p, mimoStyleRole: e.target.value }))}
            placeholder="风格角色，如 孙悟空"
            allowClear
          />
        );

      return (
        <Space orientation="vertical" style={{ width: '100%' }} size="small">
          <Space wrap style={{ width: '100%' }} align="center">
            <Text type="secondary">角色</Text>
            {roleControl}
            <Text type="secondary">情绪</Text>
            <Input
              style={{ width: 120 }}
              placeholder="情绪"
              value={emoVal}
              onChange={(e) =>
                setParams((p) => ({ ...p, emotion: e.target.value.trim() ? e.target.value : undefined }))
              }
              allowClear
            />
          </Space>
          <Text type="secondary" style={{ fontSize: 12 }}>
            待合成目标在 <code style={{ fontSize: 11 }}>assistant.content</code>；「角色」「情绪」合并为{' '}
            <code style={{ fontSize: 11 }}>&lt;style&gt;…&lt;/style&gt;</code> 置于正文前。TTS 模型不允许{' '}
            <code style={{ fontSize: 11 }}>role=system</code>，官方身份/日期说明会并入下方「身份说明」字段对应内容的首段，再与 user
            引导语拼接为一条 <code style={{ fontSize: 11 }}>user</code> 消息。
          </Text>
          <Space wrap style={{ width: '100%' }}>
            <Text type="secondary">音色 voice</Text>
            <AutoComplete
              style={{ width: 200 }}
              value={voiceVal}
              onChange={(v) => setParams((p) => ({ ...p, voice: v }))}
              options={MIMO_VOICE_PRESETS.map((v) => ({ value: v, label: v }))}
              placeholder="如 default_zh"
              allowClear
            />
            <Text type="secondary">格式</Text>
            <Select
              style={{ width: 100 }}
              value={fmt}
              onChange={(v) => setParams((p) => ({ ...p, format: v }))}
              options={[
                { value: 'mp3', label: 'mp3' },
                { value: 'wav', label: 'wav' },
              ]}
            />
          </Space>
          <div style={{ width: '100%' }}>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
              身份说明（原 system 全文，并入 user 首段；留空则用官方推荐英文句式）
            </Text>
            <TextArea
              rows={2}
              placeholder="You are MiMo, an AI assistant developed by Xiaomi. ..."
              value={typeof params.mimoSystemPrompt === 'string' ? params.mimoSystemPrompt : ''}
              onChange={(e) => {
                const v = e.target.value;
                setParams((p) => ({ ...p, mimoSystemPrompt: v === '' ? undefined : v }));
              }}
            />
          </div>
          <div style={{ width: '100%' }}>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
              user 引导语（接在身份说明之后；留空则用默认中文）
            </Text>
            <TextArea
              rows={2}
              placeholder="可选：调整合成语气与风格的说明"
              value={typeof params.mimoUserPrompt === 'string' ? params.mimoUserPrompt : ''}
              onChange={(e) => {
                const v = e.target.value;
                setParams((p) => ({ ...p, mimoUserPrompt: v === '' ? undefined : v }));
              }}
            />
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
          <Text type="secondary" style={{ fontSize: 12 }}>
            同步 HTTP 接口{' '}
            <Link
              href="https://platform.minimaxi.com/docs/api-reference/speech-t2a-http"
              target="_blank"
              rel="noreferrer"
            >
              speech-t2a-http
            </Link>
            ；系统音色见{' '}
            <Link href="https://platform.minimaxi.com/docs/faq/system-voice-id" target="_blank" rel="noreferrer">
              system-voice-id
            </Link>
            （下列选项与文档一致）。
          </Text>
          <Space wrap style={{ width: '100%' }} align="center">
            <Text type="secondary">voice_id</Text>
            <AutoComplete
              style={{ width: '100%', maxWidth: 420 }}
              value={voiceVal}
              onChange={(v) => setParams((p) => ({ ...p, voice: typeof v === 'string' ? v : '' }))}
              options={MINIMAX_VOICE_AUTOCOMPLETE_OPTIONS}
              filterOption={(input, option) => {
                const q = input.toLowerCase();
                const val = String(option?.value ?? '').toLowerCase();
                const lab = String(option?.label ?? '').toLowerCase();
                return val.includes(q) || lab.includes(q);
              }}
              placeholder="系统音色 id"
              allowClear
            />
          </Space>
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
