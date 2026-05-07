/**
 * 常见模型精简表单：密钥 + 模型显示名 / 主版本 + 名称（见功能文档 3.1.1）
 */
import { useMemo, type ClipboardEvent } from 'react';
import { Alert, AutoComplete, Button, Form, Input, Space, Tooltip, Typography } from 'antd';
import type { FormInstance } from 'antd/es/form';
import { LinkOutlined } from '@ant-design/icons';
import type { AIModelConfig } from '@/types/settings';
import type { ModelPreset } from '@/components/AIChat/constants/modelPresets';
import {
  getModelIoTypeIconClass,
  MODEL_IO_SECTION_ICON_CLASS,
  type RecommendedModalEntry,
} from '@/types/recommendedModels';
import { applyDisplayNameVersionSplitToForm } from '@/utils/modelDisplayNameInputSplit';

const { Text } = Typography;

export interface ModelPresetQuickFormValues {
  name?: string;
  modelDisplayName?: string;
  primaryVersion?: string;
  apiKey?: string;
}

export interface ModelPresetQuickFormProps {
  preset: ModelPreset;
  existingModel: AIModelConfig | undefined;
  form: FormInstance<ModelPresetQuickFormValues>;
  onSave: () => void | Promise<void>;
  onCancel: () => void;
}

export function ModelPresetQuickForm({
  preset,
  existingModel,
  form,
  onSave,
  onCancel,
}: ModelPresetQuickFormProps) {
  const hideKey = preset.isLocal;
  const requireKey = !preset.isLocal && !preset.configOnly;
  const usePrimaryVersion = preset.usePrimaryVersion !== false;
  const watchedModelName = Form.useWatch('modelDisplayName', form) as string | undefined;

  const matchedModalEntry = useMemo((): RecommendedModalEntry | undefined => {
    const raw = (watchedModelName ?? '').trim();
    if (!raw || !preset.recommendedModals?.length) return undefined;
    const n = raw;
    return preset.recommendedModals.find(
      (x) =>
        x.name === n ||
        x.displayName === n ||
        x.name.toLowerCase() === n.toLowerCase() ||
        x.displayName.toLowerCase() === n.toLowerCase(),
    );
  }, [watchedModelName, preset.recommendedModals]);

  const currentModalForIo = useMemo((): RecommendedModalEntry | null => {
    const e = matchedModalEntry;
    const io = e?.io;
    if (!io || (!io.input?.length && !io.output?.length)) return null;
    return e;
  }, [matchedModalEntry]);

  const titleTooltip = (matchedModalEntry?.description ?? '').trim() || undefined;

  const autocompleteOptions = useMemo(() => {
    const fromRec = (preset.recommendedModals ?? []).map((m) => {
      const pv = (m.primaryVersion ?? '').trim();
      return {
        value: m.name,
        label: pv ? `${m.displayName} (${pv})` : m.displayName,
      };
    });
    const taken = new Set(fromRec.map((o) => o.value));
    const fromLegacy = (preset.modelDisplayNameOptions ?? [])
      .filter((v) => !taken.has(v))
      .map((v) => ({ value: v, label: v }));
    return [...fromRec, ...fromLegacy];
  }, [preset]);

  const placeholderDisplay =
    preset.defaultModelDisplayName || preset.defaultModel || '按服务商文档填写';
  const placeholderVersion = preset.defaultPrimaryVersion || '如 260328';

  const applySplitFromEventTarget = (target: EventTarget | null) => {
    if (!usePrimaryVersion) return;
    const el = target as HTMLInputElement | null;
    if (!el?.value) return;
    applyDisplayNameVersionSplitToForm(form, el.value);
  };

  return (
    <>
      {titleTooltip ? (
        <Tooltip title={titleTooltip} placement="topLeft">
          <Text
            strong
            style={{ display: 'block', marginBottom: 8, cursor: 'help' }}
          >
            {preset.displayName}
          </Text>
        </Tooltip>
      ) : (
        <Text strong style={{ display: 'block', marginBottom: 8 }}>
          {preset.displayName}
        </Text>
      )}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '4px 14px',
          marginBottom: 12,
          fontSize: 12,
          color: 'var(--ant-color-text-secondary, rgba(0,0,0,0.65))',
        }}
      >
        <Typography.Link
          href={preset.docsUrl}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => {
            if (!window.yiman?.shell?.openExternal) return;
            e.preventDefault();
            void window.yiman.shell.openExternal(preset.docsUrl);
          }}
        >
          <LinkOutlined /> 官方文档
        </Typography.Link>
        {currentModalForIo?.io?.input?.length ? (
          <span
            style={{
              display: 'inline-flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <i
                className={`iconfont ${MODEL_IO_SECTION_ICON_CLASS.input}`}
                style={{
                  fontSize: 14,
                  color: 'var(--ant-color-text-tertiary, rgba(0,0,0,0.45))',
                }}
                aria-hidden
              />
              <Text type="secondary">输入</Text>
            </span>
            {currentModalForIo.io.input.map((id, i) => (
              <i
                key={`in-${i}`}
                className={`iconfont ${getModelIoTypeIconClass(id)}`}
                style={{
                  fontSize: 14,
                  color: 'var(--ant-color-text-tertiary, rgba(0,0,0,0.45))',
                }}
                aria-hidden
              />
            ))}
          </span>
        ) : null}
        {currentModalForIo?.io?.output?.length ? (
          <span
            style={{
              display: 'inline-flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <i
                className={`iconfont ${MODEL_IO_SECTION_ICON_CLASS.output}`}
                style={{
                  fontSize: 14,
                  color: 'var(--ant-color-text-tertiary, rgba(0,0,0,0.45))',
                }}
                aria-hidden
              />
              <Text type="secondary">输出</Text>
            </span>
            {currentModalForIo.io.output.map((id, i) => (
              <i
                key={`out-${i}`}
                className={`iconfont ${getModelIoTypeIconClass(id)}`}
                style={{
                  fontSize: 14,
                  color: 'var(--ant-color-text-tertiary, rgba(0,0,0,0.45))',
                }}
                aria-hidden
              />
            ))}
          </span>
        ) : null}
      </div>
      {preset.configOnly ? (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message="当前版本仅将配置写入本地；应用内调用需在后续版本接入对应适配器。"
        />
      ) : null}
      <Form form={form} layout="vertical">
        <Form.Item
          name="modelDisplayName"
          label="模型ID（模型编码）"
          tooltip="与控制台/文档中的模型ID（有些供应商叫模型编码、Model ID）一致，可从候选选择或自填。如果供应商要求主版本，则粘贴完整 model id（如 xxx-250615）时可自动拆分主版本。有些供应商没有主版本，则可以不填。"
        >
          <AutoComplete
            allowClear
            options={autocompleteOptions}
            placeholder={placeholderDisplay}
            filterOption={(input, option) => {
              const q = (input || '').toLowerCase();
              const v = String(option?.value ?? '').toLowerCase();
              const lab = String((option as { label?: string })?.label ?? '').toLowerCase();
              return v.includes(q) || lab.includes(q);
            }}
            onSelect={(value: string) => {
              const m = preset.recommendedModals?.find((x) => x.name === value);
              if (m) {
                form.setFieldsValue({
                  modelDisplayName: m.name,
                  primaryVersion: usePrimaryVersion ? (m.primaryVersion ?? '') : '',
                });
              }
            }}
          >
            <Input
              onKeyUp={(e) => applySplitFromEventTarget(e.target)}
              onPaste={(e: ClipboardEvent<HTMLInputElement>) => {
                if (!usePrimaryVersion) return;
                const text = e.clipboardData?.getData('text') ?? '';
                setTimeout(() => {
                  applyDisplayNameVersionSplitToForm(form, text);
                }, 0);
              }}
            />
          </AutoComplete>
        </Form.Item>
        {usePrimaryVersion ? (
        <Form.Item
          name="primaryVersion"
          label="主版本（PrimaryVersion）"
          tooltip="易变版本号，如 260328；可单独更新。有填写时，请求中模型 ID 为「名称-主版本」。无独立主版本段的预设（如部分 TTS）不显示本项。"
          dependencies={['modelDisplayName']}
          rules={[
            ({ getFieldValue }) => ({
              validator(_, v) {
                const pv = String(v ?? '').trim();
                if (!pv) return Promise.resolve();
                const d = String(getFieldValue('modelDisplayName') ?? '').trim();
                if (!d) {
                  return Promise.reject(new Error('填写主版本时请先填写模型名称（DisplayName）'));
                }
                return Promise.resolve();
              },
            }),
          ]}
        >
          <Input placeholder={placeholderVersion} allowClear />
        </Form.Item>
        ) : null}
        {!hideKey ? (
          <Form.Item
            name="apiKey"
            label="API 密钥"
            tooltip={
              preset.vendorKey
                ? '同厂商下若已配置过其他模型，可能已自动填充同一密钥。'
                : undefined
            }
            rules={requireKey ? [{ required: true, message: '请输入 API 密钥' }] : []}
          >
            <Input.Password placeholder="sk-..." allowClear />
          </Form.Item>
        ) : null}
        <Space>
          <Button type="primary" onClick={() => void onSave()}>
            {existingModel ? '保存修改' : '添加并保存'}
          </Button>
          <Button onClick={onCancel}>取消</Button>
        </Space>
      </Form>
    </>
  );
}
