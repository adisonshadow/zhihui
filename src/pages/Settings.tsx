/**
 * 设置面板：通用 + AI 模型（见功能文档 3.1、docs/配置订阅使用.md）
 * 支持全页模式（/settings）与 Modal 模式（全局打开）
 */
import { useEffect, useState } from 'react';
import { App, Modal, Button, Form, Layout, Menu, Typography } from 'antd';
import type { AISettings, AIModelConfig } from '@/types/settings';
import { getAISettings, saveAISettings } from '@/utils/settingsStorage';
import { CustomModelList } from '@/pages/settings/CustomModelList';
import { CustomModelForm, type CustomModelFormValues } from '@/pages/settings/CustomModelForm';
import { GeneralSettingsPanel } from '@/pages/settings/GeneralSettingsPanel';
import { AddAiModelModal } from '@/pages/settings/AddAiModelModal';
import {
  ModelPresetQuickForm,
  type ModelPresetQuickFormValues,
} from '@/pages/settings/ModelPresetQuickForm';
import { getPresetFormFieldsFromConfig, MODEL_PRESETS, type ModelPreset } from '@/components/AIChat/constants/modelPresets';
import { splitLegacyModelId } from '@/utils/aiModelRequestId';
import { resolveRecommendedVariant } from '@/utils/recommendedModal';

const { Text } = Typography;
const { Sider, Content } = Layout;

/** 待 React 将对应 <Form> 挂到 DOM 后再写实例，避免 useForm 未连接告警 */
function runAfterFormPaint(cb: () => void) {
  setTimeout(cb, 0);
}

type MenuKey = 'general' | 'ai';

interface SettingsProps {
  modal?: boolean;
  open?: boolean;
  onClose?: () => void;
  onSaved?: (config: AISettings) => void;
}

export default function Settings({ modal = false, open = true, onClose, onSaved }: SettingsProps) {
  const { message } = App.useApp();
  const [config, setConfig] = useState<AISettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [menuKey, setMenuKey] = useState<MenuKey>('general');
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingPreset, setEditingPreset] = useState<ModelPreset | null>(null);
  const [form] = Form.useForm<CustomModelFormValues>();
  const [presetEditForm] = Form.useForm<ModelPresetQuickFormValues>();

  const loadConfig = async () => {
    setLoading(true);
    try {
      const data = await getAISettings();
      setConfig(data);
    } catch (e) {
      message.error('加载配置失败');
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) void loadConfig();
  }, [open]);

  const persistConfig = async (data: AISettings, successMessage = '已保存'): Promise<boolean> => {
    try {
      const res = await saveAISettings(data);
      if (res.ok) {
        message.success(successMessage);
        onSaved?.(data);
        return true;
      }
      message.error(res.error || '保存失败');
      return false;
    } catch (e) {
      message.error('保存失败');
      console.error(e);
      return false;
    }
  };

  const handleApplyGeneral = async (
    patch: Pick<AISettings, 'defaultProjectRoot' | 'canvasAutoFitViewport' | 'modalMaskBlur'>,
  ) => {
    if (!config) {
      message.warning('配置加载中，请稍候再试');
      return false;
    }
    const next: AISettings = {
      ...config,
      ...patch,
    };
    const ok = await persistConfig(next, '通用设置已保存');
    if (ok) setConfig(next);
    return ok;
  };

  const handleCommitModels = async (nextModels: AIModelConfig[], successMsg = '已保存'): Promise<boolean> => {
    if (!config) return false;
    const next: AISettings = { ...config, models: nextModels };
    const ok = await persistConfig(next, successMsg);
    if (ok) setConfig(next);
    return ok;
  };

  const closeEditModal = () => {
    form.resetFields();
    presetEditForm.resetFields();
    setEditModalOpen(false);
    setEditingId(null);
    setEditingPreset(null);
  };

  const handleEdit = (m: AIModelConfig) => {
    setEditingId(m.id);
    if (m.presetKey) {
      const preset = MODEL_PRESETS.find((p) => p.presetKey === m.presetKey);
      if (preset) {
        setEditingPreset(preset);
        setEditModalOpen(true);
        runAfterFormPaint(() => {
          const p = getPresetFormFieldsFromConfig(preset, m);
          presetEditForm.setFieldsValue({
            name: m.name ?? preset.displayName,
            modelDisplayName: p.modelDisplayName,
            primaryVersion: p.primaryVersion,
            apiKey: m.apiKey ?? '',
          });
        });
        return;
      }
    }
    setEditingPreset(null);
    setEditModalOpen(true);
    runAfterFormPaint(() => {
      let modelDisplayName = m.modelDisplayName?.trim() ?? '';
      let primaryVersion = m.primaryVersion?.trim() ?? '';
      if (!modelDisplayName && !primaryVersion && m.model) {
        const s = splitLegacyModelId(m.model);
        modelDisplayName = s.modelDisplayName;
        primaryVersion = s.primaryVersion;
      }
      form.setFieldsValue({
        name: m.name,
        provider: m.provider,
        apiUrl: m.apiUrl,
        apiKey: m.apiKey,
        modelDisplayName,
        primaryVersion,
        isLocal: m.isLocal === true,
        capabilityKeys: m.capabilityKeys,
      });
    });
  };

  const handleDelete = async (id: string) => {
    if (!config) return;
    const models = (config.models ?? []).filter((x) => x.id !== id);
    const next = { ...config, models };
    setConfig(next);
    if (editingId === id) {
      closeEditModal();
    }
    const ok = await persistConfig(next, '已删除');
    if (!ok) void loadConfig();
  };

  const handleSaveEditPreset = async () => {
    if (!config || editingId == null || !editingPreset) return;
    try {
      const values = await presetEditForm.validateFields();
      const existing = config.models.find((m) => m.id === editingId);
      if (!existing) return;
      const md = (values.modelDisplayName ?? '').trim();
      const pv = (values.primaryVersion ?? '').trim();
      const variant = resolveRecommendedVariant(editingPreset, md, pv);
      const capabilityKeys =
        variant?.abilityTags?.length
          ? [...variant.abilityTags]
          : existing.capabilityKeys?.length
            ? [...existing.capabilityKeys]
            : [...editingPreset.capabilityKeys];
      const apiUrl = variant?.baseUrl?.trim()
        ? variant.baseUrl.trim()
        : existing.apiUrl ?? editingPreset.apiUrl;
      const next: AIModelConfig = {
        id: editingId,
        name: values.name?.trim() || editingPreset.displayName,
        provider: editingPreset.provider,
        apiUrl,
        apiKey: editingPreset.isLocal ? '' : (values.apiKey ?? '').trim(),
        capabilityKeys,
        presetKey: editingPreset.presetKey,
        isLocal: editingPreset.isLocal,
      };
      if (editingPreset.vendorKey) next.vendorKey = editingPreset.vendorKey;
      if (md) next.modelDisplayName = md;
      if (pv) next.primaryVersion = pv;
      if (!md && !pv && existing.model) next.model = existing.model;
      const models = config.models.map((m) => (m.id === editingId ? next : m));
      const nextConfig = { ...config, models };
      const ok = await persistConfig(nextConfig);
      if (ok) {
        setConfig(nextConfig);
        closeEditModal();
      }
    } catch {
      /* validate */
    }
  };

  const handleSaveEditModel = async () => {
    if (!config || editingId == null) return;
    try {
      const values = await form.validateFields();
      const existing = config.models.find((m) => m.id === editingId);
      const isLocal = values.isLocal === true;
      const md = (values.modelDisplayName ?? '').trim();
      const pv = (values.primaryVersion ?? '').trim();
      const next: AIModelConfig = {
        id: editingId,
        name: values.name,
        provider: values.provider,
        apiUrl: values.apiUrl ?? '',
        apiKey: isLocal ? '' : (values.apiKey ?? ''),
        capabilityKeys: values.capabilityKeys ?? [],
      };
      if (md) next.modelDisplayName = md;
      if (pv) next.primaryVersion = pv;
      if (!md && !pv && existing?.model) next.model = existing.model;
      if (existing?.presetKey) next.presetKey = existing.presetKey;
      if (isLocal) next.isLocal = true;
      const models = config.models.map((m) => (m.id === editingId ? next : m));
      const nextConfig = { ...config, models };
      const ok = await persistConfig(nextConfig);
      if (ok) {
        setConfig(nextConfig);
        closeEditModal();
      }
    } catch {
      /* validate */
    }
  };

  const innerBody = (
    <Layout style={{ minHeight: modal ? 'calc(100vh - 200px)' : 'calc(100vh - 220px)', background: 'transparent' }}>
      <Sider
        width={120}
        style={{
          overflow: 'auto',
          // borderInlineEnd: '1px solid var(--ant-color-split)',
          // background: 'var(--ant-color-bg-layout)',
          background: 'transparent',
        }}
      >
        <Menu
          mode="inline"
          selectedKeys={[menuKey]}
          style={{ borderInlineEnd: 0, height: '100%' }}
          items={[
            { key: 'general', label: '通用' },
            { key: 'ai', label: 'AI模型' },
          ]}
          onClick={({ key }) => setMenuKey(key as MenuKey)}
        />
      </Sider>
      <Content style={{ overflow: 'auto', padding: 16, minWidth: 0, background: 'transparent' }}>
        {loading ? (
          <Text type="secondary">加载中…</Text>
        ) : menuKey === 'general' ? (
          <GeneralSettingsPanel config={config} onApply={handleApplyGeneral} />
        ) : (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text strong>已添加模型</Text>
              <Button type="primary" onClick={() => setAddModalOpen(true)}>
                添加AI模型
              </Button>
            </div>
            <CustomModelList
              models={config?.models ?? []}
              filterCapabilityKeys={[]}
              hideTitle
              showAddButton={false}
              showLocalDeployTip={false}
              onAdd={() => setAddModalOpen(true)}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          </div>
        )}
      </Content>
    </Layout>
  );

  const addModal = (
    <AddAiModelModal
      open={addModalOpen}
      onClose={() => setAddModalOpen(false)}
      models={config?.models ?? []}
      onCommitModels={handleCommitModels}
    />
  );

  const editingRow = editingId ? config?.models.find((m) => m.id === editingId) : undefined;

  const editModal = (
    <Modal
      title={editingPreset ? `编辑：${editingPreset.displayName}` : '编辑 AI 模型'}
      open={editModalOpen}
      onCancel={closeEditModal}
      footer={null}
      width={560}
      centered
      destroyOnHidden
    >
      {editingPreset ? (
        <ModelPresetQuickForm
          preset={editingPreset}
          existingModel={editingRow}
          form={presetEditForm}
          onSave={() => void handleSaveEditPreset()}
          onCancel={closeEditModal}
        />
      ) : (
        <CustomModelForm
          form={form}
          formTitle="编辑模型"
          onSave={() => void handleSaveEditModel()}
          onCancel={closeEditModal}
        />
      )}
    </Modal>
  );

  if (modal) {
    return (
      <>
        <Modal
          title="配置"
          open={open}
          onCancel={onClose}
          footer={null}
          width={1000}
          centered
          destroyOnHidden
          styles={{ body: { padding: 0 } }}
        >
          {innerBody}
        </Modal>
        {addModal}
        {editModal}
      </>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      <Typography.Title level={5} style={{ marginTop: 0 }}>
        配置
      </Typography.Title>
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        通用偏好与 AI 模型；供剧情大纲、角色设计、设计器等使用。
      </Text>
      {innerBody}
      {addModal}
      {editModal}
    </div>
  );
}
