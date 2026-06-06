/**
 * 有声书全局设置：预制/自定义音色目录、默认 TTS 模型
 */
import { useEffect, useMemo } from 'react';
import { Button, Form, Input, Select, Space, Typography } from 'antd';
import { FolderOpenOutlined } from '@ant-design/icons';
import type { AISettings, AudiobookSettings } from '@/types/settings';
import { buildAudiobookTtsSelectOptions } from '@/audiobook/utils/audiobookTtsModelOptions';

const { Text, Paragraph } = Typography;

function DirPickerField({ value, onChange }: { value?: string; onChange?: (v: string) => void }) {
  return (
    <Space.Compact style={{ width: '100%' }}>
      <Input
        value={value ?? ''}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder="选择文件夹"
        style={{ flex: 1 }}
      />
      <Button
        type="primary"
        icon={<FolderOpenOutlined />}
        onClick={async () => {
          const dir = await window.yiman?.dialog?.openDirectory();
          if (dir) onChange?.(dir);
        }}
      >
        选择目录
      </Button>
    </Space.Compact>
  );
}

function buildAudiobookSettingsPayload(values: {
  presetVoiceSamplesRootDir?: string;
  customVoiceSamplesRootDir?: string;
  defaultTtsModelKey?: string;
}): AudiobookSettings {
  const preset = (values.presetVoiceSamplesRootDir ?? '').trim();
  const custom = (values.customVoiceSamplesRootDir ?? '').trim();
  const defaultTtsModelKey = (values.defaultTtsModelKey ?? '').trim();
  const row: AudiobookSettings = {};
  if (preset) row.presetVoiceSamplesRootDir = preset;
  if (custom) row.customVoiceSamplesRootDir = custom;
  if (defaultTtsModelKey) row.defaultTtsModelKey = defaultTtsModelKey;
  return row;
}

export interface AudiobookSettingsPanelProps {
  config: AISettings | null;
  onApply: (patch: Pick<AISettings, 'audiobook'>) => Promise<boolean>;
}

export function AudiobookSettingsPanel({ config, onApply }: AudiobookSettingsPanelProps) {
  const [form] = Form.useForm<{
    presetVoiceSamplesRootDir?: string;
    customVoiceSamplesRootDir?: string;
    defaultTtsModelKey?: string;
  }>();

  const ttsSelectOptions = useMemo(() => buildAudiobookTtsSelectOptions(config), [config]);

  useEffect(() => {
    if (!config) return;
    const legacy = config.audiobook?.voiceSamplesRootDir ?? '';
    form.setFieldsValue({
      presetVoiceSamplesRootDir: config.audiobook?.presetVoiceSamplesRootDir ?? legacy,
      customVoiceSamplesRootDir: config.audiobook?.customVoiceSamplesRootDir ?? legacy,
      defaultTtsModelKey: config.audiobook?.defaultTtsModelKey,
    });
  }, [config, form]);

  return (
    <div>
      <Paragraph>
        <Text strong>音色样本目录</Text>
      </Paragraph>
      <Paragraph type="secondary" style={{ marginBottom: 16 }}>
        有声书「故事大纲」中为旁白与各角色绑定参考音色时使用。内置 <Text code>PresetVoice/</Text> 目录始终可用；外置目录可选，配置后与内置样本合并排序展示。自定义目录存放「我的设计」中 AI
        生成的 wav（位于 <Text code>.yiman-voices/</Text> 子目录）。使用本地{' '}
        <Text strong>LongCat-AudioDiT</Text> 克隆时，须在每条参考 wav 同目录放置同名 UTF-8 文稿（如{' '}
        <Text code>男-有声书旁白5.txt</Text>）。
      </Paragraph>
      <Form
        form={form}
        layout="vertical"
        onFinish={async (values) => {
          await onApply({
            audiobook: buildAudiobookSettingsPayload(values),
          });
        }}
      >
        <Form.Item
          name="presetVoiceSamplesRootDir"
          label="外置音色样本目录"
          extra="可选。配置后与内置 PresetVoice/ 合并展示；递归扫描 mp3、wav、m4a、aac、flac、ogg。"
        >
          <DirPickerField />
        </Form.Item>

        <Form.Item
          name="customVoiceSamplesRootDir"
          label="自定义音色样本目录"
          extra="AI「我的设计」生成并保存的 wav 写入此目录下的 .yiman-voices/。"
        >
          <DirPickerField />
        </Form.Item>

        <Form.Item
          name="defaultTtsModelKey"
          label="默认 TTS 模型"
          extra="与有声书片段卡片中的「TTS 模型」下拉选项一致；未选择时按本地 TTS / 云端配音模型自动推断。"
        >
          <Select
            allowClear
            placeholder={ttsSelectOptions.length > 0 ? '请选择默认模型' : '请先在「本地 TTS」或「AI 模型」中配置配音模型'}
            options={ttsSelectOptions}
            disabled={ttsSelectOptions.length === 0}
            popupMatchSelectWidth={false}
            style={{ maxWidth: 480 }}
          />
        </Form.Item>

        <Form.Item>
          <Button type="primary" htmlType="submit">
            保存
          </Button>
        </Form.Item>
      </Form>
    </div>
  );
}
