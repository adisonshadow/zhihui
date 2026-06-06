/**
 * 云端 TTS 音色来源 UI（MiniMax / Qwen3-TTS）
 */
import type { ReactNode } from 'react';
import { Button, Input, Select, Space, Typography } from 'antd';
import { MINIMAX_VOICE_AUTOCOMPLETE_OPTIONS } from '@/components/tts/minimaxSystemVoices';
import type { TtsVoiceSourceKind } from '@/components/tts/remoteVoiceIdTypes';

const { Text } = Typography;

const SOURCE_OPTIONS: { value: TtsVoiceSourceKind; label: string }[] = [
  { value: 'preset', label: '预置音色' },
  { value: 'cloned_id', label: '已复刻 voice_id' },
  { value: 'clone_from_file', label: '本地文件复刻' },
  // { value: 'clone_from_url', label: '公网 URL 复刻（CosyVoice，已停用）' },
];

export interface TtsVoiceSourceFieldsProps {
  adapterLabel: string;
  params: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
  /** @deprecated CosyVoice 已停用，保留参数兼容旧数据 */
  showPublicUrl?: boolean;
  /** 预置 voice 控件 */
  presetVoiceControl?: ReactNode;
}

export function TtsVoiceSourceFields({
  adapterLabel,
  params,
  onChange,
  showPublicUrl = false,
  presetVoiceControl,
}: TtsVoiceSourceFieldsProps) {
  const rawSource = typeof params.ttsVoiceSource === 'string' ? params.ttsVoiceSource : 'preset';
  const source: TtsVoiceSourceKind =
    rawSource === 'cloned_id' || rawSource === 'clone_from_file' || rawSource === 'clone_from_url' ?
      rawSource
    : 'preset';

  const sourceOptions =
    showPublicUrl ?
      SOURCE_OPTIONS
    : SOURCE_OPTIONS.filter((o) => o.value !== 'clone_from_url');

  const pickFile = async () => {
    const dlg = window.yiman?.dialog?.openFile;
    if (!dlg) return;
    const p = await dlg({ filters: [{ name: '音频', extensions: ['wav', 'mp3', 'm4a'] }] });
    if (p) onChange({ ttsCloneAudioPath: p, ttsVoiceSource: 'clone_from_file' });
  };

  return (
    <Space orientation="vertical" style={{ width: '100%' }} size="small">
      <Text type="secondary" style={{ fontSize: 12 }}>
        {adapterLabel}：复刻后可缓存 voice id，合成失败将自动失效并重刻一次。
      </Text>
      <Space wrap align="center">
        <Text type="secondary">音色来源</Text>
        <Select
          style={{ width: 220 }}
          value={source}
          onChange={(v) => onChange({ ttsVoiceSource: v as TtsVoiceSourceKind })}
          options={sourceOptions}
        />
      </Space>
      {source === 'preset' && presetVoiceControl ?
        presetVoiceControl
      : null}
      {source === 'cloned_id' ?
        <Space wrap align="center" style={{ width: '100%' }}>
          <Text type="secondary">voice_id</Text>
          <Input
            style={{ flex: 1, minWidth: 240 }}
            placeholder="已复刻的 voice_id"
            value={typeof params.ttsClonedVoiceId === 'string' ? params.ttsClonedVoiceId : ''}
            onChange={(e) => onChange({ ttsClonedVoiceId: e.target.value })}
            allowClear
          />
        </Space>
      : null}
      {source === 'clone_from_file' ?
        <Space wrap align="center" style={{ width: '100%' }}>
          <Text type="secondary">参考音频</Text>
          <Input
            style={{ flex: 1, minWidth: 200 }}
            readOnly
            placeholder="选择 wav/mp3"
            value={typeof params.ttsCloneAudioPath === 'string' ? params.ttsCloneAudioPath : ''}
          />
          <Button onClick={() => void pickFile()}>选择文件</Button>
        </Space>
      : null}
      {source === 'clone_from_url' ?
        <Space orientation="vertical" style={{ width: '100%' }} size={4}>
          <Input
            placeholder="https://… 公网可访问的参考音频 URL（CosyVoice 必填）"
            value={typeof params.ttsClonePublicUrl === 'string' ? params.ttsClonePublicUrl : ''}
            onChange={(e) => onChange({ ttsClonePublicUrl: e.target.value })}
            allowClear
          />
          <Text type="secondary" style={{ fontSize: 11 }}>
            CosyVoice 复刻不接受本地 base64；有声书若仅有本地 wav，请上传至对象存储后粘贴 URL，或直接填写 voice_id。
          </Text>
        </Space>
      : null}
      {(source === 'clone_from_file' || source === 'clone_from_url') ?
        <Space wrap align="center" style={{ width: '100%' }}>
          <Text type="secondary">复刻前缀</Text>
          <Input
            style={{ width: 120 }}
            value={typeof params.ttsVoicePrefix === 'string' ? params.ttsVoicePrefix : 'zhihui'}
            onChange={(e) => onChange({ ttsVoicePrefix: e.target.value || 'zhihui' })}
          />
          <Text type="secondary">参考文稿（Qwen 可选）</Text>
          <Input
            style={{ flex: 1, minWidth: 160 }}
            placeholder="与参考音频一致的文字"
            value={typeof params.ttsReferenceText === 'string' ? params.ttsReferenceText : ''}
            onChange={(e) => onChange({ ttsReferenceText: e.target.value })}
            allowClear
          />
        </Space>
      : null}
    </Space>
  );
}

/** MiniMax 预置 voice AutoComplete 包装 */
export function minimaxPresetVoiceControl(
  voiceVal: string,
  onVoice: (v: string) => void,
): ReactNode {
  return (
    <Space wrap align="center" style={{ width: '100%' }}>
      <Text type="secondary">voice_id</Text>
      <Select
        style={{ width: '100%', maxWidth: 420 }}
        showSearch
        value={voiceVal}
        onChange={onVoice}
        options={MINIMAX_VOICE_AUTOCOMPLETE_OPTIONS}
        placeholder="系统音色 id"
        allowClear
      />
    </Space>
  );
}
