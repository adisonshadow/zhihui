import { useEffect, useMemo, useRef, useState } from 'react';
import { audiobookTtsCacheGetBlob } from '@/audiobook/utils/audiobookSegmentTtsCache';
import { renderVoiceEffect, getEnabledEffects } from '@/audiobook/utils/voiceEffects';
import { VOICE_EFFECT_TAGS, VOICE_EFFECT_LABELS, type VoiceEffectKey } from '@/audiobook/utils/voiceEffects/types';
import { Button, Card, Dropdown, Input, Space, Tag, Typography, Tooltip, theme } from 'antd';
import type { MenuProps } from 'antd';
import { CheckOutlined, CaretDownOutlined, LoadingOutlined } from '@ant-design/icons';
import { SegmentType, type AudioSegment } from '@/constants/Audiobook';
import type { Script } from '@/constants/Script';
import { resolveAudiobookSegmentSpeakerDisplayName } from '@/audiobook/utils/audiobookSegmentRefLabel';
import { shouldShowAudiobookSegmentPersonaTag } from '@/audiobook/utils/audiobookSegmentReference';
import { outlineStyleInstructionHintForSegment } from '@/audiobook/utils/outlineVoiceStyleInstruction';
import type { AudiobookOutlineVoiceSamples } from '@/novelDesign/storage/novelWorkspaceStorage';
import { audiobookSegmentQuickPrompts } from '@/audiobook/prompts/audiobookSegmentAiPrompts';
import './AudiobookSegmentCard.css';

const { Text, Paragraph } = Typography;

const TYPE_LABELS: Record<SegmentType, string> = {
  [SegmentType.Narration]: '旁白',
  [SegmentType.Dialogue]: '对白',
  [SegmentType.InnerVoice]: '画外音',
  [SegmentType.ChapterTitle]: '章标题',
  [SegmentType.SoundEffect]: '音效',
  [SegmentType.BackgroundMusic]: 'BGM',
};

/** 对白 / 画外音角色名 Tag 色（暗色背景下更易辨认） */
const SPEAKER_TAG_COLOR: Partial<Record<SegmentType, string>> = {
  [SegmentType.Dialogue]: 'cyan',
  [SegmentType.InnerVoice]: 'purple',
};

interface AudiobookSegmentCardProps {
  segment: AudioSegment;
  index: number;
  /** 文本类片段：本地 TTS 是否已有缓存 */
  hasTtsCache?: boolean;
  /** 有缓存时用于内嵌播放器的 blob URL */
  ttsPreviewSrc?: string;
  /** 启用的音效 key 列表 */
  enabledEffectKeys?: VoiceEffectKey[];
  /** 用于从缓存获取 TTS blob（避免 fetch blob: URL 触发 CSP） */
  ttsCacheKey?: string;
  /** 与设置中 LOCAL_TTS 选项一致的模型选择（仅文本片段展示） */
  ttsModelKey?: string;
  onTtsModelKeyChange?: (key: string) => void;
  ttsModelOptions?: { value: string; label: string }[];
  generating?: boolean;
  onGenerate?: () => void;
  /** 片段 AI 快捷提示（润色 / 重写 TTS） */
  onRunAiPrompt?: (promptKey: string) => void;
  /** 删除本片段 */
  onDelete?: () => void;
  /** 单选高亮（有声书工作台 AI refIndicator） */
  selected?: boolean;
  /** 「播放整集」时当前播放到本段：边缘暗蓝描边 */
  episodePlaybackActive?: boolean;
  /** 点击卡片主体选中；控件区需加 class audiobook-seg-card-ignore-select 以免触发 */
  onCardSelect?: () => void;
  /** 选中且为文本类片段时：编辑 TTS 原文，onChange 时由父级保存并清缓存 */
  onTextChange?: (text: string) => void;
  /** 选中时编辑 voice.tone（风格指令），blur 时保存 */
  onToneBlurSave?: (tone: string) => void;
  /** 解析对白/画外音 speakerId → 角色中文名 */
  novelScript?: Script | null;
  /** 故事大纲音色绑定；已绑 wav 的说话人不展示片段内人设腔调标签 */
  outlineVoice?: AudiobookOutlineVoiceSamples;
  /** 片段音效变更回调 */
  onVoiceEffectChange?: (effectKey: string | undefined) => void;
}

function segmentPreview(seg: AudioSegment): string {
  if (seg.type === SegmentType.SoundEffect || seg.type === SegmentType.BackgroundMusic) {
    return seg.audioSrc || '（无音频源）';
  }
  return 'text' in seg ? seg.text : '';
}

function voiceHint(seg: AudioSegment): string | null {
  if (seg.type === SegmentType.SoundEffect || seg.type === SegmentType.BackgroundMusic) return null;
  const v = seg.voice;
  const parts = [v.tone, v.emotion].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

function isTextTtsSegment(seg: AudioSegment): boolean {
  return (
    seg.type === SegmentType.Narration ||
    seg.type === SegmentType.Dialogue ||
    seg.type === SegmentType.InnerVoice ||
    seg.type === SegmentType.ChapterTitle
  );
}

function TagWithOutlineStyleHint({
  label,
  color,
  hint,
}: {
  label: string;
  color?: string;
  hint?: { show: boolean; text: string };
}) {
  const tag = (
    <Tag
      color={color}
      style={{
        fontSize: 12,
        fontWeight: 600,
        lineHeight: '20px',
        marginInlineEnd: 0,
      }}
    >
      {label}
    </Tag>
  );
  if (!hint?.show || !hint.text) return tag;
  return (
    <Tooltip title={hint.text}>
      <span className="audiobook-outline-style-tag-wrap">
        {tag}
        <span className="audiobook-outline-style-dot" aria-label="有大纲风格指令" />
      </span>
    </Tooltip>
  );
}

export function AudiobookSegmentCard({
  segment,
  index,
  hasTtsCache,
  ttsPreviewSrc,
  enabledEffectKeys,
  ttsCacheKey,
  ttsModelKey,
  onTtsModelKeyChange,
  ttsModelOptions,
  generating,
  onGenerate,
  onRunAiPrompt,
  onDelete,
  selected,
  episodePlaybackActive,
  onCardSelect,
  onTextChange,
  onToneBlurSave,
  novelScript,
  outlineVoice,
  onVoiceEffectChange,
}: AudiobookSegmentCardProps) {
  const { token } = theme.useToken();
  const [hover, setHover] = useState(false);
  const textTts = isTextTtsSegment(segment);
  const segmentText = 'text' in segment ? segment.text : '';
  const segmentTone = 'voice' in segment ? (segment.voice.tone ?? '') : '';
  const [textDraft, setTextDraft] = useState(segmentText);
  const [toneDraft, setToneDraft] = useState(segmentTone);

  /** workspace / AI 工具更新 segment.text 时同步到 TextArea（选中期间也刷新） */
  useEffect(() => {
    if (!textTts) return;
    setTextDraft(segmentText);
  }, [segmentText, textTts]);

  useEffect(() => {
    if (!textTts || !('voice' in segment)) return;
    setToneDraft(segment.voice.tone ?? '');
  }, [segment, textTts]);

  const showTextEditor = Boolean(selected && textTts && onTextChange);
  const showToneEditor = Boolean(selected && textTts && onToneBlurSave && 'voice' in segment);
  const showTtsPreview = Boolean(textTts && ttsPreviewSrc?.trim());
  const segmentEffect = textTts && 'voiceEffect' in segment ? (segment as any).voiceEffect : undefined;
  const showEffectPreview = Boolean(textTts && segmentEffect && ttsPreviewSrc?.trim());

  const [monologueUrl, setMonologueUrl] = useState<string | null>(null);
  const [monologueLoading, setMonologueLoading] = useState(false);
  const monologueUrlRef = useRef<string | null>(null);

  /** 当 ttsPreviewSrc 变化时，异步生成音效预览 */
  useEffect(() => {
    if (!showEffectPreview || !ttsPreviewSrc) {
      if (monologueUrlRef.current) {
        URL.revokeObjectURL(monologueUrlRef.current);
        monologueUrlRef.current = null;
      }
      setMonologueUrl(null);
      return;
    }
    let cancelled = false;
    setMonologueLoading(true);

    const generate = async () => {
      console.log('[VoiceEffect] 开始生成, segmentEffect:', segmentEffect, 'ttsCacheKey:', ttsCacheKey);
      try {
        // 取 TTS blob
        let blob: Blob | undefined;
        if (ttsCacheKey) {
          blob = audiobookTtsCacheGetBlob(ttsCacheKey);
        }
        if (!blob) {
          try {
            const res = await fetch(ttsPreviewSrc!);
            blob = await res.blob();
          } catch { /* skip */ }
        }
        if (!blob || blob.size === 0 || cancelled) return;

        // 解码 AudioBuffer
        const audioCtx = new AudioContext();
        const buf = await blob.arrayBuffer();
        const sourceBuffer = await audioCtx.decodeAudioData(buf);
        audioCtx.close();

        // 通过统一工具函数渲染音效
        const effectKey: VoiceEffectKey[] = segmentEffect ? [segmentEffect as VoiceEffectKey] : [];
        const dataUrl = await renderVoiceEffect(sourceBuffer, effectKey);
        if (!cancelled) {
          monologueUrlRef.current = null;
          setMonologueUrl(dataUrl);

        }
      } catch (e) {
        console.log('[VoiceEffect] 生成异常:', e);
      } finally {
        if (!cancelled) setMonologueLoading(false);
      }
    };

    void generate();
    return () => { cancelled = true; };
  }, [showEffectPreview, ttsPreviewSrc, segmentEffect]);

  const showModelSelect =
    textTts &&
    onGenerate &&
    ttsModelKey !== undefined &&
    onTtsModelKeyChange &&
    ttsModelOptions &&
    ttsModelOptions.length > 0;

  const selectable = Boolean(onCardSelect);

  const showPersonaTag = shouldShowAudiobookSegmentPersonaTag(segment, outlineVoice, novelScript);
  const personaTag =
    showPersonaTag && 'voice' in segment ? segment.voice.personaTag?.trim() : undefined;
  const speakerLabel = resolveAudiobookSegmentSpeakerDisplayName(segment, novelScript);
  const outlineStyleHint = outlineStyleInstructionHintForSegment(segment, outlineVoice);
  const typeTagHint =
    segment.type === SegmentType.Narration || segment.type === SegmentType.ChapterTitle ?
      outlineStyleHint
    : undefined;
  const speakerTagHint =
    speakerLabel && (segment.type === SegmentType.Dialogue || segment.type === SegmentType.InnerVoice) ?
      outlineStyleHint
    : undefined;

  const actionMenuItems = useMemo((): MenuProps['items'] => {
    const items: MenuProps['items'] = [];
    if (showModelSelect && ttsModelOptions) {
      for (const opt of ttsModelOptions) {
        const selected = ttsModelKey === opt.value;
        items.push({
          key: `tts:${opt.value}`,
          label: (
            <Space size={8} align="center">
              {selected ?
                <CheckOutlined style={{ color: token.colorPrimary, fontSize: 14 }} />
              : <span className="audiobook-seg-menu-check-placeholder" aria-hidden />}
              <span>{opt.label}</span>
            </Space>
          ),
        });
      }
    }
    const aiItems =
      onRunAiPrompt ?
        audiobookSegmentQuickPrompts.map((p) => ({ key: p.key, label: p.label }))
      : [];
    if (aiItems.length) {
      if (items.length) items.push({ type: 'divider' });
      items.push(...aiItems);
    }
    // 选择音效子菜单
    if (textTts && onVoiceEffectChange) {
      if (items.length) items.push({ type: 'divider' });
      const allEffects: Array<{ key: string; label: string }> = [
        { key: '', label: '无特效' },
        { key: 'innerMonologue', label: VOICE_EFFECT_TAGS.innerMonologue },
        { key: 'spaceEcho', label: VOICE_EFFECT_TAGS.spaceEcho },
        { key: 'telephone', label: VOICE_EFFECT_TAGS.telephone },
        { key: 'muffler', label: VOICE_EFFECT_TAGS.muffler },
      ];
      items.push({
        key: 'voice-effect-group',
        label: '选择音效',
        children: allEffects.map((ef) => ({
          key: `effect:${ef.key || '__none__'}`,
          label: (
            <Space size={8} align="center">
              {((segmentEffect || '') === ef.key) ?
                <CheckOutlined style={{ color: token.colorPrimary, fontSize: 14 }} />
              : <span className="audiobook-seg-menu-check-placeholder" aria-hidden />}
              <span>{ef.label}</span>
            </Space>
          ),
        })),
      });
    }
    if (onDelete) {
      if (items.length) items.push({ type: 'divider' });
      items.push({ key: 'delete-segment', label: '删除此片段', danger: true });
    }
    return items;
  }, [
    showModelSelect,
    ttsModelOptions,
    ttsModelKey,
    onRunAiPrompt,
    onDelete,
    token.colorPrimary,
    textTts,
    onVoiceEffectChange,
    segmentEffect,
  ]);

  const showActionDropdown = Boolean(textTts && actionMenuItems && actionMenuItems.length > 0);
  const ttsModelLabel =
    showModelSelect && ttsModelKey ?
      ttsModelOptions?.find((o) => o.value === ttsModelKey)?.label
    : undefined;

  const cardClassName = [
    'audiobook-seg-card',
    episodePlaybackActive ? 'audiobook-seg-card--playback-active' : '',
    !episodePlaybackActive && selected ? 'audiobook-seg-card--selected' : '',
    !episodePlaybackActive && !selected && hover ? 'audiobook-seg-card--hover' : '',
    !episodePlaybackActive && !selected && !hover ? 'audiobook-seg-card--default' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <Card
      size="small"
      className={cardClassName}
      styles={{ body: { padding: '10px 12px' } }}
      style={{
        ['--audiobook-seg-selected-border' as string]: token.colorPrimary,
        cursor: selectable ? 'pointer' : undefined,
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={(e) => {
        if (!selectable || !onCardSelect) return;
        const t = e.target as HTMLElement | null;
        if (t?.closest?.('.audiobook-seg-card-ignore-select')) return;
        onCardSelect();
      }}
    >
      <Space orientation="vertical" style={{ width: '100%' }} size={6}>
        <Space wrap style={{ width: '100%', justifyContent: 'space-between' }} align="center">
          <Space size={6} align="center">
            <Text type="secondary" style={{ fontSize: 12 }}>
              #{index + 1}
            </Text>
            {textTts && hasTtsCache ?
              <CheckOutlined style={{ color: '#52c41a', fontSize: 14 }} aria-label="已生成 TTS 缓存" />
            : null}
            <TagWithOutlineStyleHint label={TYPE_LABELS[segment.type]} hint={typeTagHint} />
            {speakerLabel ?
              <TagWithOutlineStyleHint
                label={speakerLabel}
                color={SPEAKER_TAG_COLOR[segment.type] ?? 'processing'}
                hint={speakerTagHint}
              />
            : null}
            {personaTag ?
              <Tag color="geekblue" style={{ fontSize: 11, lineHeight: '18px', marginInlineEnd: 0 }}>
                人设腔调·{personaTag}
              </Tag>
            : null}
          </Space>
          <div className="audiobook-seg-card-ignore-select" onClick={(e) => e.stopPropagation()}>
            {textTts && (onGenerate || showActionDropdown) ?
            <Space.Compact>
              {onGenerate ?
                <Button
                  type="primary"
                  size="small"
                  icon={
                    generating ?
                      <LoadingOutlined />
                    : <i className="iconfont">&#xe6e0;</i>
                  }
                  disabled={generating}
                  style={{ minWidth: 32 }}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    onGenerate();
                  }}
                >
                  生成
                </Button>
              : null}
              {showActionDropdown ?
                <Dropdown
                  menu={{
                    items: actionMenuItems,
                    onClick: ({ key, domEvent }) => {
                      domEvent.stopPropagation();
                      const k = String(key);
                      if (k.startsWith('tts:')) {
                        onTtsModelKeyChange?.(k.slice(4));
                        return;
                      }
                      if (k.startsWith('effect:')) {
                        const efKey = k.slice(7);
                        onVoiceEffectChange?.(efKey === '__none__' ? undefined : efKey);
                        return;
                      }
                      if (k === 'delete-segment') {
                        onDelete?.();
                        return;
                      }
                      onRunAiPrompt?.(k);
                    },
                  }}
                  trigger={['click']}
                >
                  <Button
                    type="primary"
                    size="small"
                    icon={<CaretDownOutlined />}
                    onClick={(ev) => ev.stopPropagation()}
                    aria-label={
                      ttsModelLabel ? `TTS 模型：${ttsModelLabel}，更多操作` : 'TTS 模型与片段操作'
                    }
                    title={ttsModelLabel ? `TTS：${ttsModelLabel}` : undefined}
                    style={ttsModelLabel ? { maxWidth: 140, paddingInline: 8 } : undefined}
                  >
                    {ttsModelLabel ?
                      <Text ellipsis style={{ maxWidth: 108, fontSize: 12, color: 'inherit' }}>
                        {ttsModelLabel}
                      </Text>
                    : null}
                  </Button>
                </Dropdown>
              : null}
            </Space.Compact>
            : null}
          </div>
        </Space>
        {showTextEditor ?
          <Input.TextArea
            className="audiobook-seg-card-ignore-select"
            value={textDraft}
            onChange={(e) => {
              const v = e.target.value;
              setTextDraft(v);
              onTextChange?.(v);
            }}
            autoSize={{ minRows: 3, maxRows: 14 }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          />
        : <Paragraph style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{segmentPreview(segment)}</Paragraph>}
        {showToneEditor ?
          <div className="audiobook-seg-card-ignore-select" style={{ width: '100%' }}>
            <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>
              风格指令
            </Text>
            <Input
              value={toneDraft}
              onChange={(e) => setToneDraft(e.target.value)}
              onBlur={() => {
                const v = toneDraft.trim();
                if (!v) {
                  setToneDraft(segmentTone);
                  return;
                }
                onToneBlurSave?.(v);
              }}
              placeholder="如：紧张、压低"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        : voiceHint(segment) ?
          <Text type="secondary" style={{ fontSize: 11 }}>
            风格指令：{voiceHint(segment)}
          </Text>
        : null}
        {showTtsPreview ?
          <div className="audiobook-seg-card-ignore-select" onMouseDown={(e) => e.stopPropagation()}>
            <audio
              key={ttsPreviewSrc}
              src={ttsPreviewSrc}
              controls
              preload="metadata"
              style={{ width: '100%', maxWidth: '100%', height: 32 }}
            />
          </div>
        : null}
        {showEffectPreview ?
          <div className="audiobook-seg-card-ignore-select" onMouseDown={(e) => e.stopPropagation()}>
            <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>
              音效：{segmentEffect ? (VOICE_EFFECT_TAGS[segmentEffect as VoiceEffectKey] ?? segmentEffect) : ''}
            </Text>
            {monologueLoading ?
              <Text type="secondary" style={{ fontSize: 11 }}>正在加载音效…</Text>
            : monologueUrl ?
              <audio
                key={monologueUrl}
                src={monologueUrl}
                controls
                preload="metadata"
                style={{ width: '100%', maxWidth: '100%', height: 32 }}
              />
            : <Text type="secondary" style={{ fontSize: 11 }}>暂无可用的音效</Text>}
          </div>
        : null}
      </Space>
    </Card>
  );
}
