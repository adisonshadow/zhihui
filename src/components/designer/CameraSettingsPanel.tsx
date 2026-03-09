/**
 * 镜头设置（选中镜头素材条时显示）：X/Y/Z 关键帧、AI 自动生成镜头、自动居中说话人物（见功能文档 6.6）
 * 镜头参数：pos_x=X, pos_y=Y, scale_x=Z（景深/缩放）
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Form, InputNumber, Button, Checkbox, Typography, App, Modal } from 'antd';
import { RobotOutlined, DeleteOutlined } from '@ant-design/icons';
import type { ProjectInfo } from '@/hooks/useProject';
import { KeyframeButton } from './KeyframeButton';
import { useKeyframeCRUD, type KeyframeProperty, type KeyframeRow } from '@/hooks/useKeyframeCRUD';
import { getInterpolatedTransform } from '@/utils/keyframeTween';

const { Text } = Typography;

const KF_TOLERANCE = 0.02;
const AUTO_SAVE_DEBOUNCE_MS = 400;

interface BlockRow {
  id: string;
  start_time: number;
  end_time: number;
  pos_x: number;
  pos_y: number;
  scale_x: number;
  scale_y: number;
}

interface CameraSettingsPanelProps {
  project: ProjectInfo;
  sceneId: string | null;
  blockId: string | null;
  currentTime: number;
  refreshKey?: number;
  onUpdate?: () => void;
  onJumpToTime?: (t: number) => void;
  onBlockUpdate?: (blockId: string, data: Partial<{ pos_x: number; pos_y: number; scale_x: number }>) => void;
}

export function CameraSettingsPanel({
  project,
  sceneId,
  blockId,
  currentTime,
  refreshKey,
  onUpdate,
  onJumpToTime,
  onBlockUpdate,
}: CameraSettingsPanelProps) {
  const { message } = App.useApp();
  const [form] = Form.useForm<{ pos_x: number; pos_y: number; scale_x: number }>();
  const [block, setBlock] = useState<BlockRow | null>(null);
  const [keyframes, setKeyframes] = useState<KeyframeRow[]>([]);
  const [addingKf, setAddingKf] = useState(false);
  const projectDir = project.project_dir;
  const { createKeyframe, updateKeyframe, deleteKeyframe, getKeyframes } = useKeyframeCRUD(projectDir);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSyncingRef = useRef(false);

  const loadBlock = useCallback(async () => {
    if (!blockId || !window.yiman?.project?.getTimelineBlockById) return;
    const b = (await window.yiman.project.getTimelineBlockById(projectDir, blockId)) as BlockRow | null;
    const kf = b ? (await getKeyframes(blockId)) ?? [] : [];
    setBlock(b);
    setKeyframes(kf);
  }, [blockId, projectDir, getKeyframes]);

  useEffect(() => {
    loadBlock();
  }, [loadBlock, refreshKey]);

  useEffect(() => {
    if (!block) return;
    const base = {
      start_time: block.start_time ?? 0,
      end_time: block.end_time ?? 1,
      pos_x: block.pos_x ?? 0.5,
      pos_y: block.pos_y ?? 0.5,
      scale_x: block.scale_x ?? 1,
      scale_y: block.scale_y ?? 1,
      rotation: 0,
    };
    const transform = getInterpolatedTransform(base, keyframes, currentTime);
    isSyncingRef.current = true;
    form.setFieldsValue({
      pos_x: transform.pos_x,
      pos_y: transform.pos_y,
      scale_x: transform.scale_x,
    });
    queueMicrotask(() => { isSyncingRef.current = false; });
  }, [block, keyframes, currentTime, form]);

  const scheduleAutoSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      saveTimerRef.current = null;
      if (!blockId || !block || !window.yiman?.project?.updateTimelineBlock) return;
      const values = form.getFieldsValue();
      const res = await window.yiman.project.updateTimelineBlock(projectDir, blockId, {
        pos_x: values.pos_x ?? 0.5,
        pos_y: values.pos_y ?? 0.5,
        scale_x: values.scale_x ?? 1,
        scale_y: values.scale_x ?? 1,
      });
      if (res?.ok) {
        onBlockUpdate?.(blockId, { pos_x: values.pos_x, pos_y: values.pos_y, scale_x: values.scale_x });
        const kfList = await getKeyframes(blockId);
        for (const prop of ['pos', 'scale'] as KeyframeProperty[]) {
          const kf = kfList.find((k) => (k.property || 'pos') === prop && Math.abs(k.time - currentTime) < KF_TOLERANCE);
          if (kf) {
            const payload = prop === 'pos' ? { pos_x: values.pos_x, pos_y: values.pos_y } : { scale_x: values.scale_x, scale_y: values.scale_x };
            await updateKeyframe(kf.id, payload);
          }
        }
        onUpdate?.();
      } else message.error(res?.error || '保存失败');
    }, AUTO_SAVE_DEBOUNCE_MS);
  }, [blockId, block, projectDir, form, getKeyframes, updateKeyframe, currentTime, onUpdate, onBlockUpdate, message]);

  useEffect(() => () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); }, []);

  const timeOnBlock = block && currentTime >= 0;

  const getKfForProperty = useCallback((prop: KeyframeProperty) => {
    const list = keyframes.filter((kf) => (kf.property || 'pos') === prop);
    const kfAtCurrent = list.find((kf) => Math.abs(kf.time - currentTime) < KF_TOLERANCE);
    const prevKf = list.filter((kf) => kf.time < currentTime).pop();
    const nextKf = list.find((kf) => kf.time > currentTime);
    return { kfAtCurrent, prevKf, nextKf };
  }, [keyframes, currentTime]);

  const handleAddKeyframe = async (property: KeyframeProperty) => {
    if (!blockId || !block) return;
    const values = form.getFieldsValue();
    setAddingKf(true);
    try {
      const kfId = `kf_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const data = { id: kfId, block_id: blockId, time: currentTime, property } as Record<string, unknown>;
      if (property === 'pos') {
        data.pos_x = values.pos_x ?? 0.5;
        data.pos_y = values.pos_y ?? 0.5;
      } else if (property === 'scale') {
        data.scale_x = values.scale_x ?? 1;
        data.scale_y = values.scale_x ?? 1;
      }
      const res = await createKeyframe(data as Parameters<typeof createKeyframe>[1]);
      if (res?.ok) {
        message.success('已添加关键帧');
        loadBlock();
        onUpdate?.();
      } else message.error(res?.error || '添加失败');
    } finally {
      setAddingKf(false);
    }
  };

  const handleDeleteKeyframe = async (property: KeyframeProperty) => {
    const { kfAtCurrent } = getKfForProperty(property);
    if (!kfAtCurrent) return;
    const res = await deleteKeyframe(kfAtCurrent.id);
    if (res?.ok) {
      message.success('已取消关键帧');
      loadBlock();
      onUpdate?.();
    } else message.error(res?.error || '删除失败');
  };

  const [scene, setScene] = useState<{ auto_center_speaker?: number } | null>(null);
  useEffect(() => {
    if (!sceneId || !window.yiman?.project?.getScene) return;
    window.yiman.project.getScene(projectDir, sceneId).then((row: { auto_center_speaker?: number } | null) => setScene(row));
  }, [projectDir, sceneId]);

  const handleAutoCenterChange = async (checked: boolean) => {
    if (!sceneId || !window.yiman?.project?.updateScene) return;
    const res = await window.yiman.project.updateScene(projectDir, sceneId, { auto_center_speaker: checked ? 1 : 0 });
    if (res?.ok) {
      setScene((prev) => (prev ? { ...prev, auto_center_speaker: checked ? 1 : 0 } : prev));
      onUpdate?.();
    } else message.error(res?.error || '保存失败');
  };

  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const handleClearCameraData = async () => {
    if (!blockId || !window.yiman?.project?.updateTimelineBlock) return;
    setClearing(true);
    try {
      for (const kf of keyframes) {
        await deleteKeyframe(kf.id);
      }
      const res = await window.yiman.project.updateTimelineBlock(projectDir, blockId, {
        pos_x: 0.5,
        pos_y: 0.5,
        scale_x: 1,
        scale_y: 1,
      });
      if (res?.ok) {
        message.success('已清空本场景镜头数据');
        setClearConfirmOpen(false);
        form.setFieldsValue({ pos_x: 0.5, pos_y: 0.5, scale_x: 1 });
        loadBlock();
        onBlockUpdate?.(blockId, { pos_x: 0.5, pos_y: 0.5, scale_x: 1 });
        onUpdate?.();
      } else message.error(res?.error || '清空失败');
    } finally {
      setClearing(false);
    }
  };

  if (!blockId || !block) {
    return <Text type="secondary">加载中…</Text>;
  }

  const posKf = getKfForProperty('pos');
  const scaleKf = getKfForProperty('scale');

  return (
    <Form
      form={form}
      layout="vertical"
      className="camera-settings-panel"
      onValuesChange={() => { if (!isSyncingRef.current) scheduleAutoSave(); }}
    >
      <div style={{ marginBottom: 12 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>镜头</Text>
      </div>

      {/* 位置 X/Y（合成一个关键帧） */}
      <div className="camera-settings-panel__param-row" style={{ display: 'flex', alignItems: 'center', marginBottom: 8, gap: 8 }}>
        <span className="camera-settings-panel__param-label" style={{ width: 48, flexShrink: 0, fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>位置</span>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <Form.Item name="pos_x" noStyle>
            <InputNumber step={0.01} precision={2} style={{ width: 64 }} placeholder="X" />
          </Form.Item>
          <Form.Item name="pos_y" noStyle>
            <InputNumber step={0.01} precision={2} style={{ width: 64 }} placeholder="Y" />
          </Form.Item>
        </div>
        <KeyframeButton
          disabled={!timeOnBlock}
          hasKeyframe={!!posKf.kfAtCurrent}
          hasPrev={!!posKf.prevKf}
          hasNext={!!posKf.nextKf}
          onToggle={posKf.kfAtCurrent ? () => handleDeleteKeyframe('pos') : () => handleAddKeyframe('pos')}
          onPrev={() => posKf.prevKf && onJumpToTime?.(posKf.prevKf.time)}
          onNext={() => posKf.nextKf && onJumpToTime?.(posKf.nextKf.time)}
          loading={addingKf}
        />
      </div>

      {/* Z（景深/缩放） */}
      <div className="camera-settings-panel__param-row" style={{ display: 'flex', alignItems: 'center', marginBottom: 16, gap: 8 }}>
        <span style={{ width: 48, flexShrink: 0, fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>景深</span>
        <div style={{ flex: 1, display: 'flex' }}>
          <Form.Item name="scale_x" noStyle>
            <InputNumber min={0.1} step={0.1} precision={2} style={{ width: 86 }} />
          </Form.Item>
        </div>
        <KeyframeButton
          disabled={!timeOnBlock}
          hasKeyframe={!!scaleKf.kfAtCurrent}
          hasPrev={!!scaleKf.prevKf}
          hasNext={!!scaleKf.nextKf}
          onToggle={scaleKf.kfAtCurrent ? () => handleDeleteKeyframe('scale') : () => handleAddKeyframe('scale')}
          onPrev={() => scaleKf.prevKf && onJumpToTime?.(scaleKf.prevKf.time)}
          onNext={() => scaleKf.nextKf && onJumpToTime?.(scaleKf.nextKf.time)}
          loading={addingKf}
        />
      </div>

      <Button type="default" icon={<RobotOutlined />} disabled style={{ width: '100%', marginBottom: 8 }} className="camera-settings-panel__ai">
        AI 自动生成镜头
      </Button>
      <Checkbox
        checked={!!scene?.auto_center_speaker}
        onChange={(e) => handleAutoCenterChange(e.target.checked)}
        disabled
      >
        自动居中说话人物
      </Checkbox>

      <Button
        type="text"
        danger
        icon={<DeleteOutlined />}
        style={{ width: '100%', marginTop: 16 }}
        onClick={() => setClearConfirmOpen(true)}
      >
        清空镜头数据
      </Button>

      <Modal
        title="清空镜头数据"
        open={clearConfirmOpen}
        onCancel={() => !clearing && setClearConfirmOpen(false)}
        onOk={handleClearCameraData}
        okText="确认清空"
        okButtonProps={{ danger: true, loading: clearing }}
        cancelButtonProps={{ disabled: clearing }}
        destroyOnHidden
      >
        <Typography.Text>确定要清空本场景的镜头数据吗？将重置位置、景深并删除所有关键帧，仅对当前场景生效。</Typography.Text>
      </Modal>
    </Form>
  );
}
