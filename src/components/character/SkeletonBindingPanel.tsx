/**
 * 骨骼绑定设计器面板：导入人物图片、选择预设骨骼、拖拽节点与人物绑定（见 docs/06-人物骨骼贴图功能设计.md）
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Drawer,
  Modal,
  Button,
  Space,
  Typography,
  App,
  Radio,
} from 'antd';
import { UploadOutlined, PictureOutlined, PauseOutlined, PlayCircleOutlined } from '@ant-design/icons';
import type { CharacterAngle, SkeletonBinding, SkeletonPreset, SkeletonPresetKind } from '@/types/skeleton';
import { SKELETON_PRESETS, getPresetByKind } from '@/types/skeleton';
import {
  getHumanAngleType,
  sampleHumanMotion,
  type HumanMotionType,
} from '@/types/skeletonMotions';

const { Text } = Typography;

export interface SkeletonBindingPanelProps {
  open: boolean;
  onClose: () => void;
  projectDir: string;
  characterId: string;
  angle: CharacterAngle;
  onSave: (angle: CharacterAngle) => void;
  /** 从素材库选择图片时需拉取素材列表 */
  getAssetDataUrl: (projectDir: string, path: string) => Promise<string | null>;
  getAssets: (projectDir: string) => Promise<{ id: string; path: string; type: string }[]>;
  saveAssetFromFile: (projectDir: string, filePath: string, type: string) => Promise<{ ok: boolean; path?: string; error?: string }>;
  openFileDialog: () => Promise<string | undefined>;
}

/** 将归一化坐标 [0,1] 转为容器内百分比 */
function normToPx(norm: number, size: number): number {
  return Math.round(norm * size);
}

export function SkeletonBindingPanel({
  open,
  onClose,
  projectDir,
  characterId,
  angle: initialAngle,
  onSave,
  getAssetDataUrl,
  getAssets,
  saveAssetFromFile,
  openFileDialog,
}: SkeletonBindingPanelProps) {
  const { message } = App.useApp();
  const [angle, setAngle] = useState<CharacterAngle>(initialAngle);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [presetKind, setPresetKind] = useState<SkeletonPresetKind>(initialAngle.skeleton?.presetKind ?? 'human');
  const [nodes, setNodes] = useState<{ id: string; position: [number, number] }[]>([]);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);
  const [assets, setAssets] = useState<{ id: string; path: string; type: string }[]>([]);
  const [saving, setSaving] = useState(false);
  /** 预览骨骼动画：走路 / 跳跃，null 表示未预览 */
  const [previewMotion, setPreviewMotion] = useState<HumanMotionType | null>(null);
  const savedNodesBeforePreview = useRef<{ id: string; position: [number, number] }[]>([]);
  const previewTimeRef = useRef(0);
  const rafRef = useRef<number>(0);

  const preset = getPresetByKind(presetKind);
  const angleType = getHumanAngleType(angle.name);

  useEffect(() => {
    setAngle(initialAngle);
    setPresetKind(initialAngle.skeleton?.presetKind ?? 'human');
  }, [initialAngle, open]);

  useEffect(() => {
    if (!open) return;
    const p = getPresetByKind(presetKind);
    const existing = initialAngle.skeleton?.nodes ?? [];
    const existingMap = new Map(existing.map((n) => [n.id, n.position]));
    setNodes(
      p.nodes.map((n) => ({
        id: n.id,
        position: (existingMap.get(n.id) ?? n.defaultPosition) as [number, number],
      }))
    );
  }, [open, presetKind, initialAngle.skeleton?.nodes]);

  useEffect(() => {
    if (!open || !initialAngle.image_path) return;
    getAssetDataUrl(projectDir, initialAngle.image_path).then(setImageDataUrl);
  }, [open, projectDir, initialAngle.image_path, getAssetDataUrl]);

  const handleUploadImage = useCallback(async () => {
    const filePath = await openFileDialog();
    if (!filePath || !saveAssetFromFile) return;
    const res = await saveAssetFromFile(projectDir, filePath, 'character');
    if (!res?.ok) {
      message.error(res?.error || '上传失败');
      return;
    }
    if (res.path) {
      setAngle((a) => ({ ...a, image_path: res.path ?? undefined }));
      const url = await getAssetDataUrl(projectDir, res.path);
      setImageDataUrl(url ?? null);
      message.success('已导入图片');
    }
  }, [projectDir, saveAssetFromFile, getAssetDataUrl, openFileDialog, message]);

  const openAssetPicker = useCallback(() => {
    setAssetPickerOpen(true);
    getAssets(projectDir).then(setAssets);
  }, [projectDir, getAssets]);

  const handlePickAsset = useCallback(
    async (path: string) => {
      setAngle((a) => ({ ...a, image_path: path }));
      const url = await getAssetDataUrl(projectDir, path);
      setImageDataUrl(url ?? null);
      setAssetPickerOpen(false);
      message.success('已选择图片');
    },
    [projectDir, getAssetDataUrl, message]
  );

  const handlePresetChange = (kind: SkeletonPresetKind) => {
    setPresetKind(kind);
    const p = getPresetByKind(kind);
    setNodes(p.nodes.map((n) => ({ id: n.id, position: [...n.defaultPosition] })));
  };

  const handleSave = useCallback(() => {
    const binding: SkeletonBinding = {
      presetKind,
      nodes: nodes.map((n) => ({ id: n.id, position: [...n.position] })),
    };
    const next: CharacterAngle = { ...angle, skeleton: binding };
    setSaving(true);
    onSave(next);
    setSaving(false);
    message.success('骨骼绑定已保存');
    onClose();
  }, [angle, presetKind, nodes, onSave, onClose, message]);

  const startPreview = useCallback((motion: HumanMotionType) => {
    savedNodesBeforePreview.current = nodes.map((n) => ({ id: n.id, position: [...n.position] }));
    previewTimeRef.current = 0;
    setPreviewMotion(motion);
  }, [nodes]);

  const stopPreview = useCallback(() => {
    setPreviewMotion(null);
    if (savedNodesBeforePreview.current.length > 0) {
      setNodes(savedNodesBeforePreview.current);
    }
  }, []);

  useEffect(() => {
    if (!previewMotion || presetKind !== 'human') return;
    const start = performance.now();
    const tick = () => {
      const t = (performance.now() - start) / 1000;
      const pose = sampleHumanMotion(angleType, previewMotion, t);
      const nextNodes = preset.nodes.map((n) => ({
        id: n.id,
        position: (pose[n.id] ?? n.defaultPosition) as [number, number],
      }));
      setNodes(nextNodes);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, [previewMotion, presetKind, angleType, preset.nodes]);

  useEffect(() => {
    if (!open) setPreviewMotion(null);
  }, [open]);

  return (
    <>
      <Drawer
        title={`骨骼绑定：${angle.name}`}
        placement="right"
        width={640}
        open={open}
        onClose={onClose}
        footer={
          <Space>
            <Button onClick={onClose}>取消</Button>
            <Button type="primary" onClick={handleSave} loading={saving}>
              保存绑定
            </Button>
          </Space>
        }
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>
              人物图片
            </Text>
            <Space wrap>
              <Button type="default" icon={<UploadOutlined />} onClick={handleUploadImage}>
                本地上传
              </Button>
              <Button type="default" icon={<PictureOutlined />} onClick={openAssetPicker}>
                从素材库选择
              </Button>
            </Space>
          </div>

          <div>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>
              骨骼预设
            </Text>
            <Radio.Group
              value={presetKind}
              onChange={(e) => handlePresetChange(e.target.value)}
              optionType="button"
              options={SKELETON_PRESETS.map((p) => ({ label: p.label, value: p.kind }))}
            />
          </div>

          {presetKind === 'human' && (
            <div>
              <Text strong style={{ display: 'block', marginBottom: 8 }}>
                骨骼动画预览
              </Text>
              <Text type="secondary" style={{ display: 'block', marginBottom: 8, fontSize: 12 }}>
                当前角度「{angle.name}」使用{angleType === 'front' ? '正面' : '侧面'}动画
              </Text>
              <Space wrap>
                {previewMotion === 'walk' ? (
                  <Button icon={<PauseOutlined />} onClick={stopPreview}>
                    停止预览（走路）
                  </Button>
                ) : (
                  <Button icon={<PlayCircleOutlined />} onClick={() => startPreview('walk')}>
                    走路
                  </Button>
                )}
                {previewMotion === 'jump' ? (
                  <Button icon={<PauseOutlined />} onClick={stopPreview}>
                    停止预览（跳跃）
                  </Button>
                ) : (
                  <Button icon={<PlayCircleOutlined />} onClick={() => startPreview('jump')}>
                    跳跃
                  </Button>
                )}
              </Space>
            </div>
          )}

          <div>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>
              拖拽骨骼节点与人物对齐
            </Text>
            <SkeletonCanvas
              imageDataUrl={imageDataUrl}
              preset={preset}
              nodes={nodes}
              onNodesChange={setNodes}
              draggingId={draggingId}
              onDraggingChange={setDraggingId}
              isPreviewing={previewMotion != null}
            />
          </div>
        </Space>
      </Drawer>

      <Modal
        title="从素材库选择图片"
        open={assetPickerOpen}
        onCancel={() => setAssetPickerOpen(false)}
        footer={null}
        width={480}
      >
        <div style={{ maxHeight: 400, overflow: 'auto' }}>
          {assets.length === 0 ? (
            <Text type="secondary">暂无素材，请先在本地上传图片。</Text>
          ) : (
            <Space wrap size="middle">
              {assets.map((a) => (
                <div
                  key={a.id}
                  style={{
                    width: 80,
                    cursor: 'pointer',
                    textAlign: 'center',
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: 8,
                    overflow: 'hidden',
                  }}
                  onClick={() => handlePickAsset(a.path)}
                >
                  <AssetThumb projectDir={projectDir} path={a.path} getDataUrl={getAssetDataUrl} />
                  <div style={{ fontSize: 12, padding: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.path}
                  </div>
                </div>
              ))}
            </Space>
          )}
        </div>
      </Modal>
    </>
  );
}

interface SkeletonCanvasProps {
  imageDataUrl: string | null;
  preset: SkeletonPreset;
  nodes: { id: string; position: [number, number] }[];
  onNodesChange: (nodes: { id: string; position: [number, number] }[]) => void;
  draggingId: string | null;
  onDraggingChange: (id: string | null) => void;
  isPreviewing?: boolean;
}

const CANVAS_SIZE = 400;

function SkeletonCanvas({ imageDataUrl, preset, nodes, onNodesChange, draggingId, onDraggingChange, isPreviewing }: SkeletonCanvasProps) {
  const [containerRef, setContainerRef] = useState<HTMLDivElement | null>(null);

  const nodeMap = new Map(nodes.map((n) => [n.id, n.position]));

  const getPosition = (nodeId: string): [number, number] => {
    return nodeMap.get(nodeId) ?? preset.nodes.find((n) => n.id === nodeId)?.defaultPosition ?? [0.5, 0.5];
  };

  const handlePointerDown = (e: React.PointerEvent, nodeId: string) => {
    if (isPreviewing) return;
    e.preventDefault();
    onDraggingChange(nodeId);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent, nodeId: string) => {
    if (draggingId !== nodeId) return;
    const el = containerRef;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    const clampedX = Math.max(0, Math.min(1, x));
    const clampedY = Math.max(0, Math.min(1, y));
    onNodesChange(
      nodes.map((n) => (n.id === nodeId ? { id: n.id, position: [clampedX, clampedY] as [number, number] } : n))
    );
  };

  const handlePointerUp = (e: React.PointerEvent, nodeId: string) => {
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    if (draggingId === nodeId) onDraggingChange(null);
  };

  return (
    <div
      ref={setContainerRef}
      style={{
        width: CANVAS_SIZE,
        height: CANVAS_SIZE,
        maxWidth: '100%',
        position: 'relative',
        background: 'rgba(0,0,0,0.25)',
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      {imageDataUrl && (
        <img
          src={imageDataUrl}
          alt=""
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            pointerEvents: 'none',
          }}
        />
      )}
      <svg
        width="100%"
        height="100%"
        style={{ position: 'absolute', left: 0, top: 0 }}
        viewBox={`0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}`}
      >
        {/* 骨骼连线（绿色） */}
        <g pointerEvents="none">
          {preset.edges.map((edge, i) => {
            const from = getPosition(edge.from);
            const to = getPosition(edge.to);
            const x1 = normToPx(from[0], CANVAS_SIZE);
            const y1 = normToPx(from[1], CANVAS_SIZE);
            const x2 = normToPx(to[0], CANVAS_SIZE);
            const y2 = normToPx(to[1], CANVAS_SIZE);
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#52c41a" strokeWidth={2} />;
          })}
        </g>
        {/* 骨骼节点（蓝色圆点，可拖拽） */}
        {preset.nodes.map((n) => {
          const pos = getPosition(n.id);
          const cx = normToPx(pos[0], CANVAS_SIZE);
          const cy = normToPx(pos[1], CANVAS_SIZE);
          return (
            <circle
              key={n.id}
              cx={cx}
              cy={cy}
              r={10}
              fill="#1890ff"
              stroke="#fff"
              strokeWidth={2}
              style={{ pointerEvents: isPreviewing ? 'none' : 'auto', cursor: isPreviewing ? 'default' : 'grab' }}
              onPointerDown={(e) => handlePointerDown(e, n.id)}
              onPointerMove={(e) => handlePointerMove(e, n.id)}
              onPointerUp={(e) => handlePointerUp(e, n.id)}
              onPointerLeave={(e) => handlePointerUp(e, n.id)}
            />
          );
        })}
      </svg>
      {!imageDataUrl && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'rgba(255,255,255,0.45)',
            fontSize: 14,
          }}
        >
          请先导入人物图片
        </div>
      )}
    </div>
  );
}

function AssetThumb({
  projectDir,
  path,
  getDataUrl,
}: {
  projectDir: string;
  path: string;
  getDataUrl: (projectDir: string, path: string) => Promise<string | null>;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  useEffect(() => {
    getDataUrl(projectDir, path).then(setDataUrl);
  }, [projectDir, path, getDataUrl]);
  return (
    <div style={{ width: 80, height: 80, background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {dataUrl ? (
        <img src={dataUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <Text type="secondary">加载中</Text>
      )}
    </div>
  );
}
