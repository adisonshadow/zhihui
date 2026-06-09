/**
 * 本地 TTS 设置面板：Segmented 切换模型，先测试通过再保存
 */
import { useCallback, useEffect, useState } from 'react';
import { Button, Form, Input, InputNumber, Segmented, Space, Switch, Typography, App } from 'antd';
import { FolderOpenOutlined, ExperimentOutlined } from '@ant-design/icons';
import type { AISettings, LocalTtsConfig, LocalTtsModelProfile } from '@/types/settings';
import {
  LOCAL_TTS_MODEL_OPTIONS,
  migrateLocalTtsConfig,
  localTtsProfileIsSaved,
} from '@/types/settings';

const { Text } = Typography;

const AI_VALIDATE_URL = 'http://127.0.0.1:19815/api/v1/tts/validate-profile';

function profileHasMossTokenizer(key: string): boolean {
  return key === 'moss_tts' || key === 'moss_tts_nano';
}

function emptyProfiles(): Record<string, LocalTtsModelProfile> {
  const o: Record<string, LocalTtsModelProfile> = {};
  for (const m of LOCAL_TTS_MODEL_OPTIONS) {
    o[m.key] = profileHasMossTokenizer(m.key)
      ? { modelPath: '', idleTimeoutMinutes: 3, mossAudioTokenizerPath: '', enabled: false }
      : { modelPath: '', idleTimeoutMinutes: 3, enabled: false };
  }
  return o;
}

function DirPickerField({ value, onChange }: { value?: string; onChange?: (v: string) => void }) {
  return (
    <Space.Compact style={{ width: '100%' }}>
      <Input
        value={value ?? ''}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder="选择或输入目录路径..."
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

export interface LocalTtsSettingsPanelProps {
  config: AISettings | null;
  onApply: (patch: { localTts: LocalTtsConfig }) => Promise<boolean>;
}

export function LocalTtsSettingsPanel({ config, onApply }: LocalTtsSettingsPanelProps) {
  const { message } = App.useApp();
  const [form] = Form.useForm<{
    modelKey: string;
    profiles: Record<string, LocalTtsModelProfile>;
  }>();

  const modelKey = Form.useWatch('modelKey', form) ?? 'longcat_audio_dit';
  const [testPassed, setTestPassed] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (!config) return;
    const base = migrateLocalTtsConfig(config.localTts) ?? {
      modelKey: 'longcat_audio_dit',
      profiles: {},
    };
    const profiles = emptyProfiles();
    for (const k of Object.keys(base.profiles)) {
      const p = base.profiles[k];
      profiles[k] = {
        modelPath: p.modelPath ?? '',
        idleTimeoutMinutes: p.idleTimeoutMinutes ?? 3,
        enabled: p.enabled === true,
        ...(profileHasMossTokenizer(k) || k === 'moss_tts_local_mlx'
          ? { mossAudioTokenizerPath: p.mossAudioTokenizerPath ?? '' }
          : {}),
      };
    }
    form.setFieldsValue({
      modelKey: base.modelKey,
      profiles,
    });
    setTestPassed(false);
  }, [config, form]);

  const markDirty = useCallback(() => {
    setTestPassed(false);
  }, []);

  const handleTest = async () => {
    const requiredPaths: (string | number)[][] = [['profiles', modelKey, 'modelPath']];
    try {
      await form.validateFields(requiredPaths);
    } catch {
      message.warning('请先填写必填项');
      return;
    }

    const values = form.getFieldsValue(true);
    const prof = values.profiles?.[modelKey];
    setTesting(true);
    try {
      const res = await fetch(AI_VALIDATE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelKey,
          profile: {
            modelPath: prof?.modelPath?.trim(),
            idleTimeoutMinutes: prof?.idleTimeoutMinutes ?? 3,
            mossAudioTokenizerPath: prof?.mossAudioTokenizerPath?.trim() || undefined,
          },
        }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string };
      if (data.ok) {
        message.success(data.message ?? '测试通过');
        setTestPassed(true);
      } else {
        message.error(data.message ?? '测试未通过');
        setTestPassed(false);
      }
    } catch (e) {
      message.error(`测试请求失败: ${e instanceof Error ? e.message : String(e)}`);
      setTestPassed(false);
    } finally {
      setTesting(false);
    }
  };

  const segmentOptions = LOCAL_TTS_MODEL_OPTIONS.map((m) => ({
    label: localTtsProfileIsSaved(config?.localTts, m.key) ? `✅ ${m.label}` : m.label,
    value: m.key,
  }));

  return (
    <div style={{ maxWidth: 640 }}>
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        配置本地 TTS：Apple Silicon 上的 MLX 模型。切换顶部标签可分别配置；修改内容后须先「测试当前模型」通过后才能保存。
      </Text>

      <Form
        form={form}
        layout="vertical"
        initialValues={{
          modelKey: 'longcat_audio_dit',
          profiles: emptyProfiles(),
        }}
        onFinish={async (v) => {
          const localTts: LocalTtsConfig = {
            enabled: true,
            modelKey: v.modelKey ?? 'longcat_audio_dit',
            profiles: {},
          };
          for (const m of LOCAL_TTS_MODEL_OPTIONS) {
            const p = v.profiles?.[m.key];
            if (!p) continue;
            const base: LocalTtsModelProfile = {
              modelPath: (p.modelPath ?? '').trim(),
              idleTimeoutMinutes: Number(p.idleTimeoutMinutes ?? 3),
              enabled: p.enabled === true,
            };
            if (profileHasMossTokenizer(m.key)) {
              const tx = (p.mossAudioTokenizerPath ?? '').trim();
              if (tx) base.mossAudioTokenizerPath = tx;
            }
            localTts.profiles[m.key] = base;
          }
          const ok = await onApply({ localTts });
          if (ok) {
            message.success('本地 TTS 设置已保存');
            setTestPassed(false);
          }
        }}
        onValuesChange={() => markDirty()}
      >
        <Form.Item label="当前配置的模型" required>
          <Space orientation="vertical" size={8} style={{ width: '100%' }}>
            <Form.Item name="modelKey" noStyle rules={[{ required: true }]}>
              <Segmented options={segmentOptions} block />
            </Form.Item>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {LOCAL_TTS_MODEL_OPTIONS.find((x) => x.key === modelKey)?.description}
            </Text>
          </Space>
        </Form.Item>



        <div style={{ display: modelKey === 'longcat_audio_dit' ? 'block' : 'none' }}>
          <Form.Item
            name={['profiles', 'longcat_audio_dit', 'enabled']}
            label="允许启用该模型"
            valuePropName="checked"
            extra="启用后该模型会出现在有声书 TTS 模型下拉中。"
          >
            <Switch checkedChildren="启用" unCheckedChildren="关闭" />
          </Form.Item>
          <Form.Item
            name={['profiles', 'longcat_audio_dit', 'modelPath']}
            label="模型目录"
            rules={[{ required: modelKey === 'longcat_audio_dit', message: '请输入或选择模型目录' }]}
            extra="在 modelscope 下载 LongCat-AudioDiT 后的本地目录，需含权重与配置。推理使用项目 python/env（见仓库 python/requirements.txt）。"
          >
            <DirPickerField />
          </Form.Item>
          <Form.Item
            name={['profiles', 'longcat_audio_dit', 'idleTimeoutMinutes']}
            label="空闲超时（分钟）"
            extra="LongCat 常驻进程无请求后退出；0 表示永不超时。默认 3。"
            rules={[{ required: modelKey === 'longcat_audio_dit', type: 'number' }]}
            getValueProps={(v) => ({ value: v ?? 3 })}
          >
            <InputNumber min={0} max={120} style={{ width: 120 }} />
          </Form.Item>
        </div>

        <div style={{ display: modelKey === 'moss_tts' ? 'block' : 'none' }}>
          <Form.Item
            name={['profiles', 'moss_tts', 'enabled']}
            label="允许启用该模型"
            valuePropName="checked"
            extra="启用后该模型会出现在有声书 TTS 模型下拉中。"
          >
            <Switch checkedChildren="启用" unCheckedChildren="关闭" />
          </Form.Item>
          <Form.Item
            name={['profiles', 'moss_tts', 'modelPath']}
            label="MOSS 模型目录"
            rules={[{ required: modelKey === 'moss_tts', message: '请输入模型目录' }]}
            extra="查看https://modelscope.cn/search?page=1&search=MOSS-TTS&type=model,选择合适的版本并下载到本地的目录。"
          >
            <DirPickerField />
          </Form.Item>
          <Form.Item
            name={['profiles', 'moss_tts', 'mossAudioTokenizerPath']}
            label="MOSS-Audio-Tokenizer 目录（可选）"
            extra="查看https://modelscope.cn/search?page=1&search=MOSS-Audio-Tokenizer&type=model，选择 MOSS 模型对应的版本并下载到本地的目录；留空则自动在主模型目录下查找 moss_audio_tokenizer 等子目录。"
          >
            <DirPickerField />
          </Form.Item>
          <Form.Item
            name={['profiles', 'moss_tts', 'idleTimeoutMinutes']}
            label="空闲超时（分钟）"
            extra="MOSS 常驻进程无请求后退出；0 表示永不超时。默认 3。"
            rules={[{ required: modelKey === 'moss_tts', type: 'number' }]}
            getValueProps={(v) => ({ value: v ?? 3 })}
          >
            <InputNumber min={0} max={120} style={{ width: 120 }} />
          </Form.Item>
        </div>

        <div style={{ display: modelKey === 'moss_tts_nano' ? 'block' : 'none' }}>
          <Form.Item
            name={['profiles', 'moss_tts_nano', 'enabled']}
            label="允许启用该模型"
            valuePropName="checked"
            extra="启用后该模型会出现在有声书 TTS 模型下拉中。"
          >
            <Switch checkedChildren="启用" unCheckedChildren="关闭" />
          </Form.Item>
          <Form.Item
            name={['profiles', 'moss_tts_nano', 'modelPath']}
            label="MOSS-TTS-Nano 模型目录"
            rules={[{ required: modelKey === 'moss_tts_nano', message: '请输入模型目录' }]}
            extra="可填 ModelScope 下载根目录（如 …/MOSS-TTS-Nano）；须另有 MLX 子目录或单独下载 Hugging Face：mlx-community/MOSS-TTS-Nano-100M（含 model.safetensors）。仅 pytorch_model.bin 的原版包无法用于本地合成。"
          >
            <DirPickerField />
          </Form.Item>
          <Form.Item
            name={['profiles', 'moss_tts_nano', 'mossAudioTokenizerPath']}
            label="MOSS-Audio-Tokenizer-Nano 目录（可选）"
            extra="https://modelscope.cn/models/openmoss/MOSS-Audio-Tokenizer-Nano；留空则自动在主模型目录下查找 audio_tokenizer 等子目录。"
          >
            <DirPickerField />
          </Form.Item>
          <Form.Item
            name={['profiles', 'moss_tts_nano', 'idleTimeoutMinutes']}
            label="空闲超时（分钟）"
            extra="Nano 常驻进程无请求后退出；0 表示永不超时。默认 3。"
            rules={[{ required: modelKey === 'moss_tts_nano', type: 'number' }]}
            getValueProps={(v) => ({ value: v ?? 3 })}
          >
            <InputNumber min={0} max={120} style={{ width: 120 }} />
          </Form.Item>
        </div>

        <Form.Item>
          <Space wrap>
            <Button
              icon={<ExperimentOutlined />}
              loading={testing}
              onClick={() => void handleTest()}
            >
              测试当前模型
            </Button>
            <Button type="primary" htmlType="submit" disabled={!testPassed}>
              保存本地 TTS 设置
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </div>
  );
}
