/**
 * 常见模型精简表单：密钥 + 多模型 ID tags（见功能文档 3.1.1）
 */
import { useMemo } from 'react';
import { Alert, Button, Form, Input, Select, Space, Tooltip, Typography } from 'antd';
import type { FormInstance } from 'antd/es/form';
import { LinkOutlined } from '@ant-design/icons';
import type { AIModelConfig } from '@/types/settings';
import type { ModelPreset } from '@/components/AIChat/constants/modelPresets';
import {
  getModelIoTypeIconClass,
  MODEL_IO_SECTION_ICON_CLASS,
  type RecommendedModalEntry,
} from '@/types/recommendedModels';
import { parseModelIdTag } from '@/utils/presetModelInstances';

const { Text } = Typography;

export interface ModelPresetQuickFormValues {
  name?: string;
  /** 多模型实例：每项为完整或可拆分的模型 ID slug */
  modelDisplayNames?: string[];
  apiKey?: string;
  /** MiniMax 音色复刻 GroupId */
  minimaxGroupId?: string;
}

export interface ModelPresetQuickFormProps {
  preset: ModelPreset;
  existingModel?: AIModelConfig | undefined;
  /** add：添加弹窗；edit：列表编辑同一 preset 下全部实例 */
  mode?: 'add' | 'edit';
  form: FormInstance<ModelPresetQuickFormValues>;
  onSave: () => void | Promise<void>;
  onCancel: () => void;
}

export function ModelPresetQuickForm({
  preset,
  mode = 'edit',
  form,
  onSave,
  onCancel,
}: ModelPresetQuickFormProps) {
  const hideKey = preset.isLocal;
  const requireKey = !preset.isLocal && !preset.configOnly;
  const usePrimaryVersion = preset.usePrimaryVersion !== false;
  const watchedTags = Form.useWatch('modelDisplayNames', form) as string[] | undefined;
  const firstTagParsed = parseModelIdTag((watchedTags?.[0] ?? '').trim());

  const matchedModalEntry = useMemo((): RecommendedModalEntry | undefined => {
    const md = firstTagParsed.modelDisplayName.trim();
    if (!md || !preset.recommendedModals?.length) return undefined;
    return preset.recommendedModals.find(
      (x) =>
        x.name === md ||
        x.displayName === md ||
        x.name.toLowerCase() === md.toLowerCase() ||
        x.displayName.toLowerCase() === md.toLowerCase(),
    );
  }, [firstTagParsed.modelDisplayName, preset.recommendedModals]);

  const currentModalForIo = useMemo((): RecommendedModalEntry | null => {
    const e = matchedModalEntry;
    const io = e?.io;
    if (!io || (!io.input?.length && !io.output?.length)) return null;
    return e;
  }, [matchedModalEntry]);

  const titleTooltip = (matchedModalEntry?.description ?? '').trim() || undefined;

  const selectOptions = useMemo(() => {
    const fromRec = (preset.recommendedModals ?? []).map((m) => {
      const pv = (m.primaryVersion ?? '').trim();
      /** tags 每项存完整 slug，选项 value 用完整 slug 便于一次选中 */
      const value = pv ? `${m.name}-${pv}` : m.name;
      return {
        value,
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
    preset.defaultModelDisplayName || preset.defaultModel || '从候选选择或输入模型 ID；可多选多条';

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
        <Form.Item name="name" label="列表名称">
          <Input placeholder={`默认「${preset.displayName}」，同 preset 多实例共用此名称`} allowClear />
        </Form.Item>
        <Form.Item
          name="modelDisplayNames"
          label="模型ID（模型编码）"
          tooltip={
            usePrimaryVersion
              ? '可添加多条；每项为完整或可拆分的模型 ID（如 xxx-250615）。从候选选中会自动带主版本；也可粘贴多个 ID（逗号分隔）。'
              : '可添加多条模型 ID；从候选选择或手输；可用逗号一次拆成多条。'
          }
          rules={[
            {
              validator: (_, v) => {
                const arr = Array.isArray(v) ? v : [];
                const nonEmpty = arr.map((x) => String(x).trim()).filter(Boolean);
                if (nonEmpty.length === 0) {
                  return Promise.reject(new Error('请至少填写一个模型 ID'));
                }
                return Promise.resolve();
              },
            },
          ]}
        >
          <Select
            mode="tags"
            allowClear
            placeholder={placeholderDisplay}
            options={selectOptions}
            tokenSeparators={[',', '，', '\n']}
            popupMatchSelectWidth={false}
            styles={{ popup: { root: { minWidth: 280 } } }}
            showSearch={{
              filterOption: (input, option) => {
                const q = (input ?? '').toLowerCase();
                const v = String((option as { value?: string })?.value ?? '').toLowerCase();
                const lab = String(option?.label ?? '').toLowerCase();
                return v.includes(q) || lab.includes(q);
              },
            }}
          />
        </Form.Item>
        {!hideKey ? (
          <Form.Item
            name="apiKey"
            label="API 密钥"
            tooltip={
              preset.vendorKey
                ? '同厂商下若已配置过其他模型，可能已自动填充同一密钥；保存后本节所有模型 ID 实例共用该密钥。'
                : undefined
            }
            rules={requireKey ? [{ required: true, message: '请输入 API 密钥' }] : []}
          >
            <Input.Password placeholder="sk-..." allowClear />
          </Form.Item>
        ) : null}
        {preset.presetKey === 'minimax_speech' ? (
          <Form.Item
            name="minimaxGroupId"
            label="MiniMax 团队 ID"
            tooltip="音色复刻与 files/upload 必填；见控制台「基本信息 → 团队 ID」（注意：不是个人信息中的UID）"
          >
            <Input placeholder="如 17xxxxxxxxxx" allowClear />
          </Form.Item>
        ) : null}
        <Space>
          <Button type="primary" onClick={() => void onSave()}>
            {mode === 'add' ? '添加并保存' : '保存修改'}
          </Button>
          <Button onClick={onCancel}>取消</Button>
        </Space>
      </Form>
    </>
  );
}
