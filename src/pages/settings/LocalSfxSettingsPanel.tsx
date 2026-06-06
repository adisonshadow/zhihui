/**
 * 本地生成音效设置面板
 */
import { useCallback, useEffect, useState } from 'react';
import { Button, Form, Input, InputNumber, Segmented, Space, Switch, Typography, App } from 'antd';
import { FolderOpenOutlined, ExperimentOutlined } from '@ant-design/icons';
import type { AISettings, LocalSfxConfig, LocalSfxModelProfile } from '@/types/settings';
import {
  LOCAL_SFX_MODEL_OPTIONS,
  migrateLocalSfxConfig,
  localSfxProfileIsSaved,
} from '@/types/settings';

const { Text } = Typography;

const AI_VALIDATE_URL = 'http://127.0.0.1:19815/api/v1/sfx/validate-profile';

function emptyProfiles(): Record<string, LocalSfxModelProfile> {
  const o: Record<string, LocalSfxModelProfile> = {};
  for (const m of LOCAL_SFX_MODEL_OPTIONS) {
    o[m.key] = {
      modelPath: '',
      idleTimeoutMinutes: 3,
      mossAudioTokenizerPath: '',
      defaultDurationSeconds: 6,
    };
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

export interface LocalSfxSettingsPanelProps {
  config: AISettings | null;
  onApply: (patch: { localSfx: LocalSfxConfig }) => Promise<boolean>;
}

export function LocalSfxSettingsPanel({ config, onApply }: LocalSfxSettingsPanelProps) {
  const { message } = App.useApp();
  const [form] = Form.useForm<{
    enabled: boolean;
    modelKey: string;
    profiles: Record<string, LocalSfxModelProfile>;
  }>();

  const modelKey = Form.useWatch('modelKey', form) ?? 'moss_sound_effect';
  const [testPassed, setTestPassed] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (!config) return;
    const base = migrateLocalSfxConfig(config.localSfx) ?? {
      enabled: false,
      modelKey: 'moss_sound_effect',
      profiles: {},
    };
    const profiles = emptyProfiles();
    for (const k of Object.keys(base.profiles)) {
      const p = base.profiles[k];
      profiles[k] = {
        modelPath: p.modelPath ?? '',
        idleTimeoutMinutes: p.idleTimeoutMinutes ?? 3,
        mossAudioTokenizerPath: p.mossAudioTokenizerPath ?? '',
        defaultDurationSeconds: p.defaultDurationSeconds ?? 6,
      };
    }
    form.setFieldsValue({
      enabled: base.enabled,
      modelKey: base.modelKey,
      profiles,
    });
    setTestPassed(false);
  }, [config, form]);

  const markDirty = useCallback(() => {
    setTestPassed(false);
  }, []);

  const handleTest = async () => {
    try {
      await form.validateFields([['profiles', modelKey, 'modelPath']]);
    } catch {
      message.warning('请先填写模型目录');
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
            defaultDurationSeconds: prof?.defaultDurationSeconds ?? 6,
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

  const segmentOptions = LOCAL_SFX_MODEL_OPTIONS.map((m) => ({
    label: localSfxProfileIsSaved(config?.localSfx, m.key) ? `✅ ${m.label}` : m.label,
    value: m.key,
  }));

  return (
    <div style={{ maxWidth: 640 }}>
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        配置本地音效生成（Apple Silicon + MLX）。修改后须先「测试当前模型」通过再保存。
      </Text>

      <Form
        form={form}
        layout="vertical"
        initialValues={{
          enabled: false,
          modelKey: 'moss_sound_effect',
          profiles: emptyProfiles(),
        }}
        onFinish={async (v) => {
          const localSfx: LocalSfxConfig = {
            enabled: v.enabled === true,
            modelKey: v.modelKey ?? 'moss_sound_effect',
            profiles: {},
          };
          for (const m of LOCAL_SFX_MODEL_OPTIONS) {
            const p = v.profiles?.[m.key];
            if (!p) continue;
            const base: LocalSfxModelProfile = {
              modelPath: (p.modelPath ?? '').trim(),
              idleTimeoutMinutes: Number(p.idleTimeoutMinutes ?? 3),
              defaultDurationSeconds: Number(p.defaultDurationSeconds ?? 6),
            };
            const tx = (p.mossAudioTokenizerPath ?? '').trim();
            if (tx) base.mossAudioTokenizerPath = tx;
            localSfx.profiles[m.key] = base;
          }
          const ok = await onApply({ localSfx });
          if (ok) {
            message.success('本地音效设置已保存');
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
              {LOCAL_SFX_MODEL_OPTIONS.find((x) => x.key === modelKey)?.description}
            </Text>
          </Space>
        </Form.Item>

        <Form.Item
          name="enabled"
          label="启用本地音效生成"
          valuePropName="checked"
          extra="开启后，有声书「添加音乐/音效」可使用本地模型按描述生成。"
        >
          <Switch checkedChildren="启用" unCheckedChildren="关闭" />
        </Form.Item>

        <div style={{ display: modelKey === 'moss_sound_effect' ? 'block' : 'none' }}>
          <Form.Item
            name={['profiles', 'moss_sound_effect', 'modelPath']}
            label="MOSS SoundEffect 模型目录"
            rules={[{ required: modelKey === 'moss_sound_effect', message: '请输入模型目录' }]}
            extra="https://modelscope.cn/models/mlx-community/MOSS-SoundEffect-MLX-4bit（含 config.json 与 safetensors，或根目录下 mlx-4bit 子目录）。"
          >
            <DirPickerField />
          </Form.Item>
          <Form.Item
            name={['profiles', 'moss_sound_effect', 'mossAudioTokenizerPath']}
            label="MOSS-Audio-Tokenizer 目录（可选）"
            extra="可与 MOSS-TTS 设置共用；留空则在主模型目录下自动查找。"
          >
            <DirPickerField />
          </Form.Item>
          <Form.Item
            name={['profiles', 'moss_sound_effect', 'defaultDurationSeconds']}
            label="默认生成时长（秒）"
            extra="有声书 Modal 本地生成 Tab 的默认时长。"
            rules={[{ required: modelKey === 'moss_sound_effect', type: 'number' }]}
            getValueProps={(v) => ({ value: v ?? 6 })}
          >
            <InputNumber min={2} max={15} step={0.5} style={{ width: 120 }} />
          </Form.Item>
          <Form.Item
            name={['profiles', 'moss_sound_effect', 'idleTimeoutMinutes']}
            label="空闲超时（分钟）"
            extra="常驻进程无请求后退出；0 表示永不超时。默认 3。"
            rules={[{ required: modelKey === 'moss_sound_effect', type: 'number' }]}
            getValueProps={(v) => ({ value: v ?? 3 })}
          >
            <InputNumber min={0} max={120} style={{ width: 120 }} />
          </Form.Item>
        </div>

        <Form.Item>
          <Space wrap>
            <Button icon={<ExperimentOutlined />} loading={testing} onClick={() => void handleTest()}>
              测试当前模型
            </Button>
            <Button type="primary" htmlType="submit" disabled={!testPassed}>
              保存本地音效设置
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </div>
  );
}
