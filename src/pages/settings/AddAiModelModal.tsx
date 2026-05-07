/**
 * 添加 AI 模型：常见模型（能力筛选 + 预设 + 右侧表单）/ 自定义表单
 */
import { useEffect, useState } from 'react';
import { Button, Form, Typography } from 'antd';
import { AdaptiveModal } from '@/components/antd-plus/AdaptiveModal';
import { AdaptiveTabs } from '@/components/antd-plus/AdaptiveTabs';
import type { AIModelConfig } from '@/types/settings';
import type { ModelPreset } from '@/components/AIChat/constants/modelPresets';
import { getPresetFormFieldsFromConfig, MODEL_PRESETS } from '@/components/AIChat/constants/modelPresets';
import { resolveRecommendedVariant } from '@/utils/recommendedModal';
import { findReusableApiKeyForPreset } from '@/utils/vendorApiKey';
import { ModelCapabilityFilter } from '@/pages/settings/ModelCapabilityFilter';
import { ModelPresetGrid } from '@/pages/settings/ModelPresetGrid';
import { ModelPresetQuickForm, type ModelPresetQuickFormValues } from '@/pages/settings/ModelPresetQuickForm';
import { CustomModelForm, type CustomModelFormValues } from '@/pages/settings/CustomModelForm';

const { Text } = Typography;

export interface AddAiModelModalProps {
  open: boolean;
  onClose: () => void;
  models: AIModelConfig[];
  onCommitModels: (nextModels: AIModelConfig[], message?: string) => Promise<boolean>;
}

export function AddAiModelModal({ open, onClose, models, onCommitModels }: AddAiModelModalProps) {
  const [tab, setTab] = useState<string>('preset');
  const [capabilityFilterKeys, setCapabilityFilterKeys] = useState<string[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<ModelPreset | null>(null);
  const [presetQuickForm] = Form.useForm<ModelPresetQuickFormValues>();
  const [addCustomForm] = Form.useForm<CustomModelFormValues>();
  const [customNewId, setCustomNewId] = useState('');

  useEffect(() => {
    if (!open) return;
    setCustomNewId(`m_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`);
    setTab('preset');
    setCapabilityFilterKeys([]);
    setSelectedPreset(null);
    presetQuickForm.resetFields();
    addCustomForm.setFieldsValue({
      apiUrl: '',
      apiKey: '',
      capabilityKeys: [],
      isLocal: false,
    });
  }, [open, presetQuickForm, addCustomForm]);

  useEffect(() => {
    if (!open || tab !== 'custom') return;
    addCustomForm.setFieldsValue({ capabilityKeys: capabilityFilterKeys });
  }, [open, tab, capabilityFilterKeys, addCustomForm]);

  const existingForPreset = selectedPreset
    ? models.find((m) => m.presetKey === selectedPreset.presetKey)
    : undefined;

  useEffect(() => {
    if (!open || !selectedPreset) return;
    const ex = models.find((m) => m.presetKey === selectedPreset.presetKey);
    const p = getPresetFormFieldsFromConfig(selectedPreset, ex);
    const reused = ex?.apiKey?.trim() ? ex.apiKey : findReusableApiKeyForPreset(models, selectedPreset);
    presetQuickForm.setFieldsValue({
      name: ex?.name ?? selectedPreset.displayName,
      modelDisplayName: p.modelDisplayName,
      primaryVersion: p.primaryVersion,
      apiKey: ex?.apiKey ?? reused ?? '',
    });
  }, [open, selectedPreset, models, presetQuickForm]);

  const handleSelectPreset = (preset: ModelPreset) => {
    setSelectedPreset(preset);
    const ex = models.find((m) => m.presetKey === preset.presetKey);
    const p = getPresetFormFieldsFromConfig(preset, ex);
    const reused = ex?.apiKey?.trim() ? ex.apiKey : findReusableApiKeyForPreset(models, preset);
    presetQuickForm.setFieldsValue({
      name: ex?.name ?? preset.displayName,
      modelDisplayName: p.modelDisplayName,
      primaryVersion: p.primaryVersion,
      apiKey: ex?.apiKey ?? reused ?? '',
    });
  };

  const handleSavePreset = async () => {
    if (!selectedPreset) return;
    try {
      const values = await presetQuickForm.validateFields();
      const existing = models.find((m) => m.presetKey === selectedPreset.presetKey);
      const id = existing?.id ?? `m_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const md = (values.modelDisplayName ?? '').trim();
      const pv = (values.primaryVersion ?? '').trim();
      const variant = resolveRecommendedVariant(selectedPreset, md, pv);
      const capabilityKeys =
        variant?.abilityTags?.length
          ? [...variant.abilityTags]
          : existing?.capabilityKeys?.length
            ? [...existing.capabilityKeys]
            : [...selectedPreset.capabilityKeys];
      const apiUrl = variant?.baseUrl?.trim()
        ? variant.baseUrl.trim()
        : existing?.apiUrl ?? selectedPreset.apiUrl;
      const nextModel: AIModelConfig = {
        id,
        name: values.name?.trim() || selectedPreset.displayName,
        provider: selectedPreset.provider,
        apiUrl,
        apiKey: selectedPreset.isLocal ? '' : (values.apiKey ?? '').trim(),
        capabilityKeys,
        presetKey: selectedPreset.presetKey,
        isLocal: selectedPreset.isLocal,
      };
      if (selectedPreset.vendorKey) nextModel.vendorKey = selectedPreset.vendorKey;
      if (md) nextModel.modelDisplayName = md;
      if (pv) nextModel.primaryVersion = pv;
      const nextModels = existing
        ? models.map((m) => (m.id === existing.id ? nextModel : m))
        : [...models, nextModel];
      const ok = await onCommitModels(nextModels, existing ? '已保存修改' : '已添加模型');
      if (ok) {
        presetQuickForm.resetFields();
        setSelectedPreset(null);
      }
    } catch {
      /* validate */
    }
  };

  const handleSaveCustom = async () => {
    try {
      const values = await addCustomForm.validateFields();
      const isLocal = values.isLocal === true;
      const md = (values.modelDisplayName ?? '').trim();
      const pv = (values.primaryVersion ?? '').trim();
      const next: AIModelConfig = {
        id: customNewId || `m_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        name: values.name,
        provider: values.provider,
        apiUrl: values.apiUrl ?? '',
        apiKey: isLocal ? '' : (values.apiKey ?? ''),
        capabilityKeys: values.capabilityKeys ?? [],
      };
      if (md) next.modelDisplayName = md;
      if (pv) next.primaryVersion = pv;
      if (isLocal) next.isLocal = true;
      const nextModels = [...models, next];
      const ok = await onCommitModels(nextModels, '已添加模型');
      if (ok) onClose();
    } catch {
      /* validate */
    }
  };

  const presetBody = (
    <div
      style={{
        display: 'flex',
        height: '100%',
        minHeight: 0,
        gap: 0,
      }}
    >
      <div
        style={{
          width: '50%',
          flexShrink: 0,
          minHeight: 0,
          overflowY: 'auto',
          borderRight: '1px solid var(--ant-color-split)',
          paddingRight: 12,
        }}
      >
        <ModelCapabilityFilter value={capabilityFilterKeys} onChange={setCapabilityFilterKeys} />
        <div style={{ marginTop: 12 }}>
          <ModelPresetGrid
            presets={MODEL_PRESETS.filter((p) => !p.hideFromAddModal)}
            filterCapabilityKeys={capabilityFilterKeys}
            models={models}
            selectedPresetKey={selectedPreset?.presetKey ?? null}
            onSelectPreset={handleSelectPreset}
          />
        </div>
      </div>
      <div
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          overflowY: 'auto',
          paddingLeft: 16,
        }}
      >
        {selectedPreset ? (
          <ModelPresetQuickForm
            preset={selectedPreset}
            existingModel={existingForPreset}
            form={presetQuickForm}
            onSave={() => void handleSavePreset()}
            onCancel={() => {
              presetQuickForm.resetFields();
              setSelectedPreset(null);
            }}
          />
        ) : (
          <>
            {/* 未选预设时子组件不渲染 Form，需占位连接 useForm 实例，避免 Ant Design 警告 */}
            <Form form={presetQuickForm} style={{ display: 'none' }} />
            <Text type="secondary">在左侧选择一个常见模型后，在此填写密钥等信息并保存。</Text>
          </>
        )}
      </div>
    </div>
  );

  const customBody = (
    <div style={{ height: '100%', minHeight: 0, overflowY: 'auto' }}>
      <ModelCapabilityFilter value={capabilityFilterKeys} onChange={setCapabilityFilterKeys} />
      <CustomModelForm
        form={addCustomForm}
        formTitle="仅支持OpenAI兼容协议的模型"
        showActionButtons={false}
        hideCapabilityField
        onSave={() => void handleSaveCustom()}
        onCancel={() => {
          addCustomForm.setFieldsValue({
            apiUrl: '',
            apiKey: '',
            capabilityKeys: [],
            isLocal: false,
            name: undefined,
            provider: undefined,
            modelDisplayName: undefined,
            primaryVersion: undefined,
            model: undefined,
          });
        }}
      />
      <Button type="primary" style={{ marginTop: 8 }} onClick={() => void handleSaveCustom()}>
        添加并保存
      </Button>
    </div>
  );

  return (
    <AdaptiveModal
      title="添加 AI 模型"
      open={open}
      onCancel={onClose}
      width={960}
      centered
      destroyOnHidden
      containerHeight="90%"
      bodyScrollY
      footer={[
        <Button key="done" type="primary" onClick={onClose}>
          完成
        </Button>,
      ]}
    >
      <div style={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <AdaptiveTabs
          style={{ flex: 1, minHeight: 0 }}
          contentOverflow={false}
          activeKey={tab}
          // type="card"
          centered
          onChange={(k) => setTab(k)}
          items={[
            { key: 'preset', label: '添加常见模型', children: presetBody, forceRender: true },
            {
              key: 'custom',
              label: '自定义添加',
              children: customBody,
              forceRender: true,
            },
          ]}
        />
      </div>
    </AdaptiveModal>
  );
}
