/**
 * 选中素材设置（列 3 手风琴）：信息与素材自带设置、位置大小（缩放/位置/旋转）、关键帧（见功能文档 6.8、开发计划 2.12）
 * 关键帧按属性独立：位置/缩放/旋转各自独立；设置自动保存，无保存按钮
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Form, Input, InputNumber, Button, Typography, Space, Switch, Slider, App } from 'antd';
import type { FormInstance } from 'antd';
import type { ProjectInfo } from '@/hooks/useProject';
import { KeyframeButton } from './KeyframeButton';
import { useKeyframeCRUD, type KeyframeProperty, type KeyframeRow } from '@/hooks/useKeyframeCRUD';
import { getInterpolatedTransform, getInterpolatedEffects } from '@/utils/keyframeTween';

const { Text } = Typography;

interface BlockRow {
  id: string;
  layer_id: string;
  asset_id: string | null;
  start_time: number;
  end_time: number;
  pos_x: number;
  pos_y: number;
  scale_x: number;
  scale_y: number;
  rotation: number;
  lock_aspect?: number;
  blur?: number;
  opacity?: number;
}

interface AssetRow {
  id: string;
  path: string;
  type: string;
  description: string | null;
}

interface SelectedBlockSettingsProps {
  project: ProjectInfo;
  blockId: string | null;
  currentTime: number;
  refreshKey?: number;
  onUpdate?: () => void;
  onJumpToTime?: (t: number) => void;
  /** 乐观更新 blur/opacity，画布立即反映 */
  onBlockUpdate?: (blockId: string, data: Partial<{ blur: number; opacity: number }>) => void;
}

const KF_TOLERANCE = 0.02;
const AUTO_SAVE_DEBOUNCE_MS = 400;
/** 数值显示精度：时间 1 位，缩放/位置/旋转 2 位 */
const PRECISION_TIME = 1;
const PRECISION_TRANSFORM = 2;

/** 缩放控件：Slider + InputNumber（百分比），Form.Item 注入 value/onChange */
function ScaleControl({
  value,
  onChange,
  lockAspect,
  form,
  precision,
}: {
  value?: number;
  onChange?: (v: number) => void;
  lockAspect: boolean;
  form: FormInstance<any>;
  precision: number;
}) {
  const handleChange = (v: number) => {
    onChange?.(v);
    if (lockAspect) form.setFieldValue('scale_y', v);
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
      <Slider
        min={0.01}
        max={2}
        step={0.01}
        style={{ flex: 1, margin: 0 }}
        value={value}
        onChange={handleChange}
      />
      <InputNumber
        size="small"
        min={0.01}
        max={10}
        step={0.01}
        precision={precision}
        value={value}
        onChange={(v) => handleChange(typeof v === 'number' ? v : 0)}
        formatter={(v) => (v != null && String(v) !== '' ? `${(Number(v) * 100).toFixed(2)}%` : '')}
        parser={(v) => (v ? parseFloat(String(v).replace(/%/g, '')) / 100 : 0)}
        style={{ width: 64, flexShrink: 0 }}
      />
    </div>
  );
}

export function SelectedBlockSettings({ project, blockId, currentTime, refreshKey, onUpdate, onJumpToTime, onBlockUpdate }: SelectedBlockSettingsProps) {
  const { message } = App.useApp();
  const projectDir = project.project_dir;
  const { createKeyframe, updateKeyframe, deleteKeyframe, getKeyframes } = useKeyframeCRUD(projectDir);
  const [form] = Form.useForm<{ pos_x: number; pos_y: number; scale_x: number; scale_y: number; rotation: number; blur: number; opacity: number }>();

  const [block, setBlock] = useState<BlockRow | null>(null);
  const [asset, setAsset] = useState<AssetRow | null>(null);
  const [keyframes, setKeyframes] = useState<KeyframeRow[]>([]);
  const [savingDuration, setSavingDuration] = useState(false);
  const [addingKf, setAddingKf] = useState(false);
  const [duration, setDuration] = useState(0);
  const [lockAspect, setLockAspect] = useState(true);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 防止时间轴移动时 form.setFieldsValue 触发 onValuesChange 导致误保存 */
  const isSyncingFromTimelineRef = useRef(false);

  const handleLockAspectChange = useCallback(
    async (checked: boolean) => {
      setLockAspect(checked);
      if (!blockId || !window.yiman?.project?.updateTimelineBlock) return;
      const res = await window.yiman.project.updateTimelineBlock(projectDir, blockId, {
        lock_aspect: checked ? 1 : 0,
      });
      if (res?.ok) onUpdate?.();
      else message.error(res?.error || '保存失败');
    },
    [blockId, projectDir, onUpdate, message]
  );

  const loadBlock = useCallback(async () => {
    if (!blockId || !window.yiman?.project?.getTimelineBlockById) return;
    const b = (await window.yiman.project.getTimelineBlockById(projectDir, blockId)) as BlockRow | null;
    const kf = b ? (await getKeyframes(blockId)) || [] : [];
    setBlock(b);
    setKeyframes(kf);
    if (b) {
      setLockAspect((b.lock_aspect ?? 1) !== 0);
      const start = b.start_time ?? 0;
      const end = b.end_time ?? start + 5;
      setDuration(Math.max(0, end - start));
      if (b.asset_id && window.yiman?.project?.getAssetById) {
        const a = (await window.yiman.project.getAssetById(projectDir, b.asset_id)) as AssetRow | null;
        setAsset(a);
      } else setAsset(null);
    } else {
      setAsset(null);
      setDuration(0);
    }
  }, [blockId, projectDir, getKeyframes]);

  useEffect(() => {
    loadBlock();
  }, [loadBlock, refreshKey]);

  /** 时间轴移动时，用关键帧插值同步表单显示（见功能文档 6.8） */
  useEffect(() => {
    if (!block) return;
    const base = {
      start_time: block.start_time,
      end_time: block.end_time,
      pos_x: block.pos_x ?? 0.5,
      pos_y: block.pos_y ?? 0.5,
      scale_x: block.scale_x ?? 1,
      scale_y: block.scale_y ?? 1,
      rotation: block.rotation ?? 0,
      blur: block.blur ?? 0,
      opacity: block.opacity ?? 1,
    };
    const transform = getInterpolatedTransform(base, keyframes, currentTime);
    const effects = getInterpolatedEffects(base, keyframes, currentTime);
    isSyncingFromTimelineRef.current = true;
    form.setFieldsValue({
      pos_x: transform.pos_x,
      pos_y: transform.pos_y,
      scale_x: transform.scale_x,
      scale_y: transform.scale_y,
      rotation: transform.rotation,
      blur: effects.blur,
      opacity: effects.opacity,
    });
    queueMicrotask(() => { isSyncingFromTimelineRef.current = false; });
  }, [block, keyframes, currentTime, form]);

  /** 自动保存位置大小（防抖）；若当前时间有关键帧则同步更新关键帧值 */
  const scheduleAutoSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      saveTimerRef.current = null;
      if (!blockId || !block || !window.yiman?.project?.updateTimelineBlock) return;
      const values = form.getFieldsValue();
      const blurVal = values.blur ?? block.blur ?? 0;
      const opacityVal = values.opacity ?? block.opacity ?? 1;
      const res = await window.yiman.project.updateTimelineBlock(projectDir, blockId, {
        pos_x: values.pos_x ?? block.pos_x ?? 0.5,
        pos_y: values.pos_y ?? block.pos_y ?? 0.5,
        scale_x: values.scale_x ?? block.scale_x ?? 1,
        scale_y: values.scale_y ?? block.scale_y ?? 1,
        rotation: values.rotation ?? block.rotation ?? 0,
        blur: blurVal,
        opacity: opacityVal,
      });
      if (res?.ok) {
        onBlockUpdate?.(blockId, { blur: blurVal, opacity: opacityVal });
        const kfList = await getKeyframes(blockId);
        for (const prop of ['pos', 'scale', 'rotation', 'blur', 'opacity'] as KeyframeProperty[]) {
          const kf = kfList.find((k) => (k.property || 'pos') === prop && Math.abs(k.time - currentTime) < KF_TOLERANCE);
          if (kf) {
            const payload = prop === 'pos' ? { pos_x: values.pos_x, pos_y: values.pos_y }
              : prop === 'scale' ? { scale_x: values.scale_x, scale_y: values.scale_y }
              : prop === 'rotation' ? { rotation: values.rotation }
              : prop === 'blur' ? { blur: values.blur }
              : { opacity: values.opacity };
            await updateKeyframe(kf.id, payload);
          }
        }
        onUpdate?.();
      } else message.error(res?.error || '保存失败');
    }, AUTO_SAVE_DEBOUNCE_MS);
  }, [blockId, block, projectDir, form, getKeyframes, updateKeyframe, currentTime, onUpdate, onBlockUpdate, message]);

  useEffect(() => () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); }, []);

  const handleSaveDuration = async () => {
    if (!blockId || !block || !window.yiman?.project?.updateTimelineBlock) return;
    const start = block.start_time ?? 0;
    const newEnd = start + duration;
    if (newEnd <= start) {
      message.warning('播放时长须大于 0');
      return;
    }
    setSavingDuration(true);
    const res = await window.yiman.project.updateTimelineBlock(projectDir, blockId, { end_time: newEnd });
    setSavingDuration(false);
    if (res?.ok) {
      message.success('已更新播放时间');
      loadBlock();
      onUpdate?.();
    } else message.error(res?.error || '保存失败');
  };

  const timeOnBlock = block && currentTime >= block.start_time && currentTime <= block.end_time;

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
      const data = { id: kfId, block_id: blockId, time: currentTime, property } as {
        id: string; block_id: string; time: number; property: KeyframeProperty;
        pos_x?: number; pos_y?: number; scale_x?: number; scale_y?: number; rotation?: number; blur?: number; opacity?: number;
      };
      if (property === 'pos') {
        data.pos_x = values.pos_x ?? block.pos_x ?? 0.5;
        data.pos_y = values.pos_y ?? block.pos_y ?? 0.5;
      } else if (property === 'scale') {
        data.scale_x = values.scale_x ?? block.scale_x ?? 1;
        data.scale_y = values.scale_y ?? block.scale_y ?? 1;
      } else if (property === 'rotation') {
        data.rotation = values.rotation ?? block.rotation ?? 0;
      } else if (property === 'blur') {
        data.blur = values.blur ?? block.blur ?? 0;
      } else if (property === 'opacity') {
        data.opacity = values.opacity ?? block.opacity ?? 1;
      } else {
        data.rotation = values.rotation ?? block.rotation ?? 0;
      }
      const res = await createKeyframe(data);
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

  if (!blockId) {
    return (
      <Form form={form} className="selected-block-settings">
        <Text type="secondary" className="selected-block-settings__placeholder">在画布或时间轴选中素材后显示</Text>
      </Form>
    );
  }

  if (!block) {
    return (
      <Form form={form} className="selected-block-settings">
        <Text type="secondary" className="selected-block-settings__placeholder">加载中…</Text>
      </Form>
    );
  }

  const assetName = asset?.description || asset?.path?.split(/[/\\]/).pop() || block.asset_id || '—';
  const typeLabel = asset?.type ? { character: '人物', scene_bg: '场景背景', prop: '情景道具', sfx: '声效', transparent_video: '透明视频特效', music: '音乐', sticker: '贴纸' }[asset.type] || asset.type : '—';

  return (
    <div className="selected-block-settings" style={{ padding: '4px 0' }}>
      {/* 素材信息 */}
      <section className="selected-block-settings__section selected-block-settings__asset-info" style={{ marginBottom: 12 }}>
        <Text type="secondary" style={{ fontSize: 12 }} className="selected-block-settings__label">素材信息</Text>
        <div className="selected-block-settings__asset-detail" style={{ marginTop: 4 }}>
          <Text strong className="selected-block-settings__asset-name">{assetName}</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }} className="selected-block-settings__asset-type">类型：{typeLabel}</Text>
        </div>
      </section>

      {/* 播放时间 */}
      <section className="selected-block-settings__section selected-block-settings__duration" style={{ marginBottom: 12 }}>
        <Text type="secondary" style={{ fontSize: 12 }} className="selected-block-settings__label">播放时间</Text>
        <div className="selected-block-settings__duration-controls" style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Space.Compact>
            <InputNumber
              size="small"
              min={0.1}
              max={3600}
              step={0.1}
              precision={PRECISION_TIME}
              value={duration}
              onChange={(v) => setDuration(typeof v === 'number' ? v : 0)}
              style={{ width: 90 }}
              className="selected-block-settings__duration-input"
            />
            <Input size="small" value="秒" readOnly style={{ width: 32, textAlign: 'center', background: 'rgba(255,255,255,0.04)' }} />
          </Space.Compact>
          <Button size="small" type="primary" onClick={handleSaveDuration} loading={savingDuration} className="selected-block-settings__duration-apply">
            应用
          </Button>
        </div>
      </section>

      {/* 位置大小（参考图）：缩放、等比缩放、位置、旋转，每行 label | 控件 | 关键帧右对齐 */}
      <section className="selected-block-settings__section selected-block-settings__transform" style={{ marginBottom: 12 }}>
        <Text type="secondary" style={{ fontSize: 12 }} className="selected-block-settings__label">位置大小</Text>
        <Form
          form={form}
          layout="vertical"
          style={{ marginTop: 8 }}
          onValuesChange={(changed, all) => {
            if (isSyncingFromTimelineRef.current) return;
            scheduleAutoSave();
            // 即时乐观更新：blur/opacity 变化时立即反映到画布，不等防抖保存
            if ((changed.blur !== undefined || changed.opacity !== undefined) && blockId) {
              const blurVal = all.blur ?? block?.blur ?? 0;
              const opacityVal = all.opacity ?? block?.opacity ?? 1;
              onBlockUpdate?.(blockId, { blur: blurVal, opacity: opacityVal });
            }
          }}
          className="selected-block-settings__transform-form"
        >
          {/* 缩放：Slider + InputNumber + 关键帧 */}
          <div className="selected-block-settings__param-row" style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
            <span className="selected-block-settings__param-label" style={{ width: 64, flexShrink: 0, fontSize: 12 }}>缩放</span>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <Form.Item name="scale_x" noStyle>
                <ScaleControl
                  lockAspect={lockAspect}
                  form={form}
                  precision={PRECISION_TRANSFORM}
                />
              </Form.Item>
            </div>
            <div style={{ marginLeft: 'auto', flexShrink: 0 }}>
              <KeyframeButton
                disabled={!timeOnBlock}
                hasKeyframe={!!getKfForProperty('scale').kfAtCurrent}
                hasPrev={!!getKfForProperty('scale').prevKf}
                hasNext={!!getKfForProperty('scale').nextKf}
                onToggle={getKfForProperty('scale').kfAtCurrent ? () => handleDeleteKeyframe('scale') : () => handleAddKeyframe('scale')}
                onPrev={() => getKfForProperty('scale').prevKf && onJumpToTime?.(getKfForProperty('scale').prevKf!.time)}
                onNext={() => getKfForProperty('scale').nextKf && onJumpToTime?.(getKfForProperty('scale').nextKf!.time)}
                loading={addingKf}
              />
            </div>
          </div>
          {/* 等比缩放 */}
          <div className="selected-block-settings__param-row" style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
            <span className="selected-block-settings__param-label" style={{ width: 64, flexShrink: 0, fontSize: 12 }}>等比缩放</span>
            <div style={{ flex: 1 }} />
            <Switch size="small" checked={lockAspect} onChange={handleLockAspectChange} style={{ flexShrink: 0 }} />
          </div>
          {/* 位置 X/Y */}
          <div className="selected-block-settings__param-row" style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
            <span className="selected-block-settings__param-label" style={{ width: 64, flexShrink: 0, fontSize: 12 }}>位置</span>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <Form.Item name="pos_x" noStyle>
                <InputNumber size="small" min={0} max={1} step={0.01} precision={PRECISION_TRANSFORM} style={{ width: 64 }} placeholder="X" />
              </Form.Item>
              <Form.Item name="pos_y" noStyle>
                <InputNumber size="small" min={0} max={1} step={0.01} precision={PRECISION_TRANSFORM} style={{ width: 64 }} placeholder="Y" />
              </Form.Item>
            </div>
            <div style={{ marginLeft: 'auto', flexShrink: 0 }}>
              <KeyframeButton
                disabled={!timeOnBlock}
                hasKeyframe={!!getKfForProperty('pos').kfAtCurrent}
                hasPrev={!!getKfForProperty('pos').prevKf}
                hasNext={!!getKfForProperty('pos').nextKf}
                onToggle={getKfForProperty('pos').kfAtCurrent ? () => handleDeleteKeyframe('pos') : () => handleAddKeyframe('pos')}
                onPrev={() => getKfForProperty('pos').prevKf && onJumpToTime?.(getKfForProperty('pos').prevKf!.time)}
                onNext={() => getKfForProperty('pos').nextKf && onJumpToTime?.(getKfForProperty('pos').nextKf!.time)}
                loading={addingKf}
              />
            </div>
          </div>
          {/* 旋转 */}
          <div className="selected-block-settings__param-row" style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
            <span className="selected-block-settings__param-label" style={{ width: 64, flexShrink: 0, fontSize: 12 }}>旋转</span>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
              <Form.Item name="rotation" noStyle>
                <InputNumber size="small" min={-360} max={360} step={1} precision={PRECISION_TRANSFORM} style={{ width: 72 }} />
              </Form.Item>
            </div>
            <div style={{ marginLeft: 'auto', flexShrink: 0 }}>
              <KeyframeButton
                disabled={!timeOnBlock}
                hasKeyframe={!!getKfForProperty('rotation').kfAtCurrent}
                hasPrev={!!getKfForProperty('rotation').prevKf}
                hasNext={!!getKfForProperty('rotation').nextKf}
                onToggle={getKfForProperty('rotation').kfAtCurrent ? () => handleDeleteKeyframe('rotation') : () => handleAddKeyframe('rotation')}
                onPrev={() => getKfForProperty('rotation').prevKf && onJumpToTime?.(getKfForProperty('rotation').prevKf!.time)}
                onNext={() => getKfForProperty('rotation').nextKf && onJumpToTime?.(getKfForProperty('rotation').nextKf!.time)}
                loading={addingKf}
              />
            </div>
          </div>
          {/* 模糊 */}
          <div className="selected-block-settings__param-row" style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
            <span className="selected-block-settings__param-label" style={{ width: 64, flexShrink: 0, fontSize: 12 }}>模糊</span>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
              <Form.Item name="blur" noStyle>
                <InputNumber size="small" min={0} max={50} step={0.5} precision={1} style={{ width: 72 }} />
              </Form.Item>
            </div>
            <div style={{ marginLeft: 'auto', flexShrink: 0 }}>
              <KeyframeButton
                disabled={!timeOnBlock}
                hasKeyframe={!!getKfForProperty('blur').kfAtCurrent}
                hasPrev={!!getKfForProperty('blur').prevKf}
                hasNext={!!getKfForProperty('blur').nextKf}
                onToggle={getKfForProperty('blur').kfAtCurrent ? () => handleDeleteKeyframe('blur') : () => handleAddKeyframe('blur')}
                onPrev={() => getKfForProperty('blur').prevKf && onJumpToTime?.(getKfForProperty('blur').prevKf!.time)}
                onNext={() => getKfForProperty('blur').nextKf && onJumpToTime?.(getKfForProperty('blur').nextKf!.time)}
                loading={addingKf}
              />
            </div>
          </div>
          {/* 透明度 */}
          <div className="selected-block-settings__param-row" style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
            <span className="selected-block-settings__param-label" style={{ width: 64, flexShrink: 0, fontSize: 12 }}>透明度</span>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <Form.Item name="opacity" noStyle>
                <Slider min={0} max={1} step={0.01} style={{ flex: 1, margin: 0 }} />
              </Form.Item>
              <Form.Item name="opacity" noStyle>
                <InputNumber size="small" min={0} max={1} step={0.01} precision={2} style={{ width: 56, flexShrink: 0 }} />
              </Form.Item>
            </div>
            <div style={{ marginLeft: 'auto', flexShrink: 0 }}>
              <KeyframeButton
                disabled={!timeOnBlock}
                hasKeyframe={!!getKfForProperty('opacity').kfAtCurrent}
                hasPrev={!!getKfForProperty('opacity').prevKf}
                hasNext={!!getKfForProperty('opacity').nextKf}
                onToggle={getKfForProperty('opacity').kfAtCurrent ? () => handleDeleteKeyframe('opacity') : () => handleAddKeyframe('opacity')}
                onPrev={() => getKfForProperty('opacity').prevKf && onJumpToTime?.(getKfForProperty('opacity').prevKf!.time)}
                onNext={() => getKfForProperty('opacity').nextKf && onJumpToTime?.(getKfForProperty('opacity').nextKf!.time)}
                loading={addingKf}
              />
            </div>
          </div>
        </Form>
      </section>
    </div>
  );
}
