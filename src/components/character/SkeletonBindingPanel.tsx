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
  Checkbox,
} from 'antd';
import { UploadOutlined, PictureOutlined, PauseOutlined, PlayCircleOutlined } from '@ant-design/icons';
import type { CharacterAngle, SkeletonBinding, SkeletonPreset, SkeletonPresetKind, HumanAngleView } from '@/types/skeleton';
import { SKELETON_PRESETS, getPresetByKind } from '@/types/skeleton';
import {
  getHumanAngleType,
  getRestPose,
  sampleHumanMotion,
  getAvailableMotions,
  type HumanMotionType,
} from '@/types/skeletonMotions';
import {
  HUMAN_MESH_TRIANGLES,
  getMeshVertexPosition,
  getAffineFromTri,
} from '@/utils/skeletonSkinning';
import { generateContourMesh, suggestBonePositionsFromContour, recomputeContourMeshWeights } from '@/utils/contourMesh';
import { EditableTitle } from '@/components/antd-plus/EditableTitle';

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
  /** RVM 抠图接口，用于轮廓网格生成时获取更准确的边缘 */
  matteImageForContour?: (projectDir: string, relativePath: string) => Promise<{ ok: boolean; dataUrl?: string; error?: string }>;
}

/** 将归一化坐标 [0,1] 转为容器内像素 */
function normToPx(norm: number, size: number): number {
  return norm * size;
}

/** 骨骼 id 到颜色的映射，用于权重可视化（12 顶点：头顶-下颌-锁骨-肚脐/肩胛-肘-腕-指尖/髋-膝-脚跟-脚尖） */
const BONE_COLORS: Record<string, string> = {
  head_top: '#ff6b6b',
  jaw: '#ffa94d',
  collarbone: '#ffd43b',
  navel: '#ffe066',
  shoulder_l: '#69db7c',
  elbow_l: '#38d9a9',
  wrist_l: '#20c997',
  fingertip_l: '#0ca678',
  shoulder_r: '#63e6be',
  elbow_r: '#96f2d7',
  wrist_r: '#b2f2bb',
  fingertip_r: '#0ca678',
  hip_l: '#4dabf7',
  knee_l: '#339af0',
  heel_l: '#228be6',
  toe_l: '#1c7ed6',
  hip_r: '#5c7cfa',
  knee_r: '#364fc7',
  heel_r: '#364fc7',
  toe_r: '#1c7ed6',
};

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
  matteImageForContour,
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
  const [showMeshWeights, setShowMeshWeights] = useState(false);
  const [showSkeleton, setShowSkeleton] = useState(true);
  const [generatingContour, setGeneratingContour] = useState(false);
  const [useRvmMatting, setUseRvmMatting] = useState(false); // 暂时不使用 RVM 抠图
  const savedNodesBeforePreview = useRef<{ id: string; position: [number, number] }[]>([]);
  const rafRef = useRef<number>(0);
  /** 预览时人物图片随骨骼根节点（髋）的位移，归一化 [dx, dy] */
  const [imageTranslate, setImageTranslate] = useState<[number, number]>([0, 0]);

  const preset = getPresetByKind(presetKind);
  const [angleView, setAngleView] = useState<HumanAngleView>(angle.skeleton?.angleView ?? 'front');
  const angleType = getHumanAngleType(angleView, angle.name);

  useEffect(() => {
    setAngle(initialAngle);
    setPresetKind(initialAngle.skeleton?.presetKind ?? 'human');
    setAngleView(initialAngle.skeleton?.angleView ?? 'front');
  }, [initialAngle, open]);

  const restPoseForView = getRestPose(angleView);
  // 旧 id 到新 id 的迁移（12 顶点统一后，兼容旧绑定数据）
  const LEGACY_ID_MAP: Record<string, string> = {
    head: 'head_top', neck: 'jaw', spine: 'collarbone', spine_lower: 'navel',
    hand_l: 'fingertip_l', hand_r: 'fingertip_r', ankle_l: 'heel_l', ankle_r: 'heel_r', hip: 'navel',
  };
  const defPosFromExisting = (existingMap: Map<string, [number, number]>, nid: string) => {
    const direct = existingMap.get(nid);
    if (direct) return direct;
    const legacy = Object.entries(LEGACY_ID_MAP).find(([, v]) => v === nid);
    if (legacy) return existingMap.get(legacy[0]);
    return undefined;
  };
  useEffect(() => {
    if (!open) return;
    const p = getPresetByKind(presetKind);
    const existing = initialAngle.skeleton?.nodes ?? [];
    const existingMap = new Map(existing.map((n) => [n.id, n.position]));
    const defPos = (nid: string) =>
      defPosFromExisting(existingMap, nid) ?? restPoseForView[nid] ?? p.nodes.find((n) => n.id === nid)?.defaultPosition ?? [0.5, 0.5];
    setNodes(p.nodes.map((n) => ({ id: n.id, position: defPos(n.id) as [number, number] })));
  }, [open, presetKind, initialAngle.skeleton?.nodes, angleView]);

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
    const pose = getRestPose(angleView);
    setNodes(
      p.nodes.map((n) => ({
        id: n.id,
        position: (pose[n.id] ?? n.defaultPosition) as [number, number],
      }))
    );
  };

  const handleAngleViewChange = (view: HumanAngleView) => {
    setAngleView(view);
    setAngle((a) => ({
      ...a,
      skeleton: a.skeleton ? { ...a.skeleton, angleView: view } : undefined,
    }));
    const p = getPresetByKind(presetKind);
    const pose = getRestPose(view);
    setNodes(
      p.nodes.map((n) => ({
        id: n.id,
        position: (pose[n.id] ?? n.defaultPosition) as [number, number],
      }))
    );
  };

  const handleGenerateContourMesh = useCallback(async () => {
    if (!angle.image_path) {
      message.warning('请先导入人物图片');
      return;
    }
    setGeneratingContour(true);
    try {
      let dataUrlForContour = imageDataUrl;
      if (useRvmMatting && matteImageForContour) {
        message.loading({ content: 'RVM 抠图中…', key: 'matting', duration: 0 });
        const matteRes = await matteImageForContour(projectDir, angle.image_path);
        message.destroy('matting');
        if (matteRes.ok && matteRes.dataUrl) {
          dataUrlForContour = matteRes.dataUrl;
        } else {
          message.warning(matteRes.error ?? 'RVM 抠图失败，将使用原图透明通道');
        }
      }
      if (!dataUrlForContour) {
        message.warning('请先导入人物图片');
        return;
      }
      const runContour = async (dataUrl: string): Promise<ReturnType<typeof generateContourMesh>> => {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const i = new Image();
          i.crossOrigin = 'anonymous';
          i.onload = () => resolve(i);
          i.onerror = () => reject(new Error('图片加载失败'));
          i.src = dataUrl;
        });
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('无法创建 Canvas 上下文');
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        return generateContourMesh({ imageData, nodes, presetKind });
      };

      let result = await runContour(dataUrlForContour);
      if (!result.ok && /仅\s*0\s*个轮廓点/.test(result.reason) && useRvmMatting && imageDataUrl) {
        message.info('RVM 输出轮廓异常，改用原图透明通道重试');
        result = await runContour(imageDataUrl);
      }
      if (result.ok) {
        const mesh = result.mesh;
        setAngle((a) => ({
          ...a,
          skeleton: a.skeleton ? { ...a.skeleton, contourMesh: mesh } : undefined,
        }));
        message.success(`已生成轮廓网格（${mesh.vertices.length} 顶点，${mesh.triangles.length} 三角形），含自动骨骼加权，请保存绑定以持久化`);
      } else {
        message.warning(result.reason);
      }
    } catch (e) {
      message.error(e instanceof Error ? e.message : '生成轮廓网格失败');
    } finally {
      setGeneratingContour(false);
    }
  }, [imageDataUrl, angle.image_path, nodes, presetKind, message, useRvmMatting, matteImageForContour, projectDir]);

  const handleSave = useCallback(() => {
    const nodesToSave =
      previewMotion && savedNodesBeforePreview.current.length > 0
        ? savedNodesBeforePreview.current
        : nodes;
    const binding: SkeletonBinding = {
      presetKind,
      angleView,
      nodes: nodesToSave.map((n) => ({ id: n.id, position: [...n.position] })),
      ...(angle.skeleton?.vertexWeights?.length && { vertexWeights: angle.skeleton.vertexWeights }),
      ...(angle.skeleton?.contourMesh && { contourMesh: angle.skeleton.contourMesh }),
    };
    const next: CharacterAngle = { ...angle, skeleton: binding };
    setSaving(true);
    onSave(next);
    setSaving(false);
    message.success('骨骼绑定已保存');
    onClose();
  }, [angle, presetKind, angleView, nodes, previewMotion, onSave, onClose, message]);

  const startPreview = useCallback((motion: HumanMotionType) => {
    if (!previewMotion && savedNodesBeforePreview.current.length === 0) {
      savedNodesBeforePreview.current = nodes.map((n) => ({ id: n.id, position: [...n.position] }));
    }
    setPreviewMotion(motion);
  }, [nodes, previewMotion]);

  const stopPreview = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    if (savedNodesBeforePreview.current.length > 0) {
      setNodes(savedNodesBeforePreview.current);
    }
    setPreviewMotion(null);
    setImageTranslate([0, 0]);
  }, []);

  useEffect(() => {
    if (!previewMotion || presetKind !== 'human') return;
    const bindPose = savedNodesBeforePreview.current;
    const bindMap = new Map(bindPose.map((n) => [n.id, n.position]));
    const restPose = getRestPose(angleType);
    const start = performance.now();
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      const t = (performance.now() - start) / 1000;
      const motionPose = sampleHumanMotion(angleType, previewMotion, t);
      const nextNodes = preset.nodes.map((n) => {
        const bind = bindMap.get(n.id) ?? n.defaultPosition;
        const rest = restPose[n.id] ?? n.defaultPosition;
        const motion = motionPose[n.id] ?? rest;
        const dx = motion[0] - rest[0];
        const dy = motion[1] - rest[1];
        return { id: n.id, position: [bind[0] + dx, bind[1] + dy] as [number, number] };
      });
      setNodes(nextNodes);
      const restRoot = restPose['navel'] ?? [0.5, 0.38];
      const motionRoot = motionPose['navel'] ?? restRoot;
      setImageTranslate([motionRoot[0] - restRoot[0], motionRoot[1] - restRoot[1]]);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    };
  }, [previewMotion, presetKind, angleType, preset.nodes]);

  useEffect(() => {
    if (!open) {
      setPreviewMotion(null);
      setImageTranslate([0, 0]);
    }
  }, [open]);

  return (
    <>
      <Drawer
        title={
          <EditableTitle
            value={angle.name}
            onChange={(v) => setAngle((a) => ({ ...a, name: v.trim() || a.name }))}
            placeholder="角度"
            prefix="骨骼绑定："
          />
        }
        placement="right"
        size={640}
        maskClosable={false}
        open={open}
        onClose={onClose}
        extra={
          <Button type="primary" onClick={handleSave} loading={saving}>
            保存
          </Button>
        }
      >
        <Space orientation="vertical" style={{ width: '100%' }} size="middle">
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
                角度
              </Text>
              <Radio.Group
                value={angleView}
                onChange={(e) => handleAngleViewChange(e.target.value)}
                optionType="button"
                options={[
                  { label: '正面', value: 'front' },
                  { label: '45度', value: 'front45' },
                  { label: '侧面', value: 'side' },
                  { label: '背面', value: 'back' },
                ]}
              />
            </div>
          )}

          {presetKind === 'human' && (
            <div>
              <Text strong style={{ display: 'block', marginBottom: 8 }}>
                骨骼动画预览
              </Text>
              <Space wrap>
                {getAvailableMotions(angleType).map((motion) => {
                  const labels: Record<HumanMotionType, string> = {
                    walk: '走路',
                    run: '奔跑',
                    jump: '跳跃',
                    wave: '挥手',
                    mj_dance: 'MJ舞蹈',
                  };
                  return previewMotion === motion ? (
                    <Button key={motion} icon={<PauseOutlined />} onClick={stopPreview}>
                      停止预览（{labels[motion]}）
                    </Button>
                  ) : (
                    <Button key={motion} icon={<PlayCircleOutlined />} onClick={() => startPreview(motion)}>
                      {labels[motion]}
                    </Button>
                  );
                })}
              </Space>
              <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                <Checkbox checked={showSkeleton} onChange={(e) => setShowSkeleton(e.target.checked)}>
                  显示骨骼
                </Checkbox>
                <Checkbox checked={showMeshWeights} onChange={(e) => setShowMeshWeights(e.target.checked)}>
                  显示网格与权重
                </Checkbox>
              </div>
            </div>
          )}

          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
              <Text strong>拖拽骨骼节点与人物对齐</Text>
              <Space wrap>
                {presetKind === 'human' && (
                  <>
                    <Button
                      size="small"
                      onClick={() => {
                        const pose = getRestPose(angleView);
                        setNodes(
                          preset.nodes.map((n) => ({
                            id: n.id,
                            position: (pose[n.id] ?? n.defaultPosition ?? [0.5, 0.5]) as [number, number],
                          }))
                        );
                        message.success('已重置为当前角度默认骨骼');
                      }}
                    >
                      重置骨骼
                    </Button>
                    <Button
                      loading={generatingContour}
                      size="small"
                      onClick={handleGenerateContourMesh}
                    >
                      生成轮廓
                    </Button>
                    {angle.skeleton?.contourMesh && (
                      <>
                        <Button
                          size="small"
                          onClick={() => {
                            const suggested = suggestBonePositionsFromContour(
                              angle.skeleton!.contourMesh!,
                              preset,
                              angleType
                            );
                            setNodes(suggested);
                            message.success('已根据轮廓自动放置骨骼');
                          }}
                        >
                          自动骨骼
                        </Button>
                        <Button
                          size="small"
                          onClick={() => {
                            const boneNodes = preset.nodes.map((n) => ({
                              id: n.id,
                              position: nodes.find((x) => x.id === n.id)?.position ?? n.defaultPosition,
                            })) as { id: string; position: [number, number] }[];
                            const newMesh = recomputeContourMeshWeights(angle.skeleton!.contourMesh!, boneNodes, presetKind);
                            setAngle((a) => ({
                              ...a,
                              skeleton: a.skeleton ? { ...a.skeleton, contourMesh: newMesh } : undefined,
                            }));
                            message.success('已重新计算顶点骨骼权重');
                          }}
                        >
                          重算加权
                        </Button>
                      </>
                    )}
                  </>
                )}
              </Space>
            </div>
            {showMeshWeights && presetKind === 'human' && (
              <div style={{ marginBottom: 8, fontSize: 11, color: 'rgba(255,255,255,0.65)', display: 'flex', flexWrap: 'wrap', gap: '8px 16px' }}>
                蓝菱形=骨骼顶点，圆点=部位顶点(颜色=主控权重)，黄线=网格边，悬停可看权重
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ color: '#1890ff', fontSize: 10 }}>◆</span>
                  骨骼顶点
                </span>
                {REGION_LEGEND.map(({ region, color }) => (
                  <span key={region} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 6, height: 6, borderRadius: 3, background: color }} />
                    {region}
                  </span>
                ))}
              </div>
            )}
            <SkeletonCanvas
              imageDataUrl={imageDataUrl}
              preset={preset}
              nodes={nodes}
              onNodesChange={setNodes}
              draggingId={draggingId}
              onDraggingChange={setDraggingId}
              isPreviewing={previewMotion != null}
              imageTranslate={imageTranslate}
              bindPoseForSkinning={previewMotion ? savedNodesBeforePreview.current : undefined}
              vertexWeights={angle.skeleton?.vertexWeights}
              contourMesh={angle.skeleton?.contourMesh}
              showMeshWeights={showMeshWeights}
              showSkeleton={showSkeleton}
              onContourVertexMove={
                angle.skeleton?.contourMesh
                  ? (vertexId, position) => {
                      const mesh = angle.skeleton!.contourMesh!;
                      const nextVertices = mesh.vertices.map((v) =>
                        v.id === vertexId ? { ...v, position } : v
                      );
                      setAngle((a) => ({
                        ...a,
                        skeleton: a.skeleton
                          ? { ...a.skeleton, contourMesh: { ...mesh, vertices: nextVertices } }
                          : undefined,
                      }));
                      if (vertexId.startsWith('s_')) {
                        const boneId = vertexId.replace(/^s_/, '');
                        setNodes((prev) =>
                          prev.map((n) => (n.id === boneId ? { ...n, position } : n))
                        );
                      }
                    }
                  : undefined
              }
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
  /** 预览时人物图随骨骼根节点位移，归一化 [dx, dy]（非 Canvas 蒙皮时使用） */
  imageTranslate?: [number, number];
  /** 预览时传入绑定姿态，用于 Canvas 2D 骨骼蒙皮（仅人物预设） */
  bindPoseForSkinning?: { id: string; position: [number, number] }[];
  /** 加权变换数据，有则用加权蒙皮，无则回退到三角形仿射 */
  vertexWeights?: { vertexId: string; weights: { boneId: string; weight: number }[] }[];
  /** 基于图像轮廓的完整网格，有则优先使用 */
  contourMesh?: { vertices: { id: string; position: [number, number]; weights: { boneId: string; weight: number }[] }[]; triangles: [string, string, string][] };
  /** 是否显示蒙皮网格边界与顶点权重 */
  showMeshWeights?: boolean;
  /** 是否显示骨骼连线与节点 */
  showSkeleton?: boolean;
  /** 轮廓网格顶点拖拽移动时回调（用于微调） */
  onContourVertexMove?: (vertexId: string, position: [number, number]) => void;
}

const CANVAS_SIZE = 400;

function getBoneColor(boneId: string): string {
  return BONE_COLORS[boneId] ?? '#868e96';
}

/** 骨骼顶点 id 集合（内部顶点，蓝色菱形） */
const HUMAN_BONE_VERTEX_IDS = new Set([
  'head_top', 'jaw', 'collarbone', 'navel',
  'shoulder_l', 'elbow_l', 'wrist_l', 'fingertip_l',
  'shoulder_r', 'elbow_r', 'wrist_r', 'fingertip_r',
  'hip_l', 'knee_l', 'heel_l', 'toe_l',
  'hip_r', 'knee_r', 'heel_r', 'toe_r',
]);

function isBoneVertex(vertexId: string): boolean {
  if (HUMAN_BONE_VERTEX_IDS.has(vertexId)) return true;
  if (vertexId.startsWith('s_')) return HUMAN_BONE_VERTEX_IDS.has(vertexId.slice(2));
  return false;
}

/** 主控骨骼 → 部位名称（仅中文，不含数字） */
const BONE_TO_REGION: Record<string, string> = {
  head_top: '头',
  jaw: '脖',
  collarbone: '胸腹',
  navel: '胸腹',
  shoulder_l: '肩',
  shoulder_r: '肩',
  elbow_l: '上臂',
  elbow_r: '上臂',
  wrist_l: '下臂',
  wrist_r: '下臂',
  fingertip_l: '手',
  fingertip_r: '手',
  hip_l: '臀',
  hip_r: '臀',
  knee_l: '大腿',
  knee_r: '大腿',
  heel_l: '小腿',
  heel_r: '小腿',
  toe_l: '脚',
  toe_r: '脚',
};
const LEGACY_BONE_ID_MAP: Record<string, string> = {
  head: 'head_top', neck: 'jaw', spine: 'collarbone', spine_lower: 'navel',
  hand_l: 'fingertip_l', hand_r: 'fingertip_r', ankle_l: 'heel_l', ankle_r: 'heel_r', hip: 'navel',
};

function getRegionLabel(boneId: string): string {
  const resolved = LEGACY_BONE_ID_MAP[boneId] ?? boneId;
  return BONE_TO_REGION[resolved] ?? boneId;
}

/** 部位顶点专用颜色：不用蓝系，相邻部位差异大，头与脚可相近 */
const REGION_COLORS: Record<string, string> = {
  头: '#e03131',
  脖: '#cc5de8',
  肩: '#f59f00',
  上臂: '#77a600',
  下臂: '#059660',
  手: '#c92a2a',
  胸腹: '#fcc419',
  臀: '#cc5de8',
  大腿: '#554bdb',
  小腿: '#003e66',
  脚: '#c92a2a',
};

function getRegionColor(boneId: string): string {
  const label = getRegionLabel(boneId);
  return REGION_COLORS[label] ?? '#868e96';
}

/** 图例（短名称 + 部位顶点专用色） */
const REGION_LEGEND: { region: string; color: string }[] = [
  { region: '头', color: REGION_COLORS['头']! },
  { region: '脖', color: REGION_COLORS['脖']! },
  { region: '肩', color: REGION_COLORS['肩']! },
  { region: '上臂', color: REGION_COLORS['上臂']! },
  { region: '下臂', color: REGION_COLORS['下臂']! },
  { region: '手', color: REGION_COLORS['手']! },
  { region: '胸腹', color: REGION_COLORS['胸腹']! },
  { region: '臀', color: REGION_COLORS['臀']! },
  { region: '大腿', color: REGION_COLORS['大腿']! },
  { region: '小腿', color: REGION_COLORS['小腿']! },
  { region: '脚', color: REGION_COLORS['脚']! },
];

function SkeletonCanvas({
  imageDataUrl,
  preset,
  nodes,
  onNodesChange,
  draggingId,
  onDraggingChange,
  isPreviewing,
  imageTranslate = [0, 0],
  bindPoseForSkinning,
  vertexWeights,
  contourMesh,
  showMeshWeights = false,
  showSkeleton = true,
  onContourVertexMove,
}: SkeletonCanvasProps) {
  const [containerRef, setContainerRef] = useState<HTMLDivElement | null>(null);
  const [draggingVertexId, setDraggingVertexId] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [imageElement, setImageElement] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!imageDataUrl) {
      setImageElement(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => setImageElement(img);
    img.onerror = () => setImageElement(null);
    img.src = imageDataUrl;
    return () => { img.src = ''; };
  }, [imageDataUrl]);

  const nodeMap = new Map(nodes.map((n) => [n.id, n.position]));

  const imgW = imageElement?.naturalWidth ?? 1;
  const imgH = imageElement?.naturalHeight ?? 1;
  const scale = Math.min(CANVAS_SIZE / imgW, CANVAS_SIZE / imgH);
  const displayW = imgW * scale;
  const displayH = imgH * scale;
  const offsetX = (CANVAS_SIZE - displayW) / 2;
  const offsetY = (CANVAS_SIZE - displayH) / 2;
  const normToDisplay = (nx: number, ny: number): [number, number] =>
    imageElement
      ? [offsetX + nx * displayW, offsetY + ny * displayH]
      : [nx * CANVAS_SIZE, ny * CANVAS_SIZE];
  const containerToImageNorm = (cxNorm: number, cyNorm: number): [number, number] =>
    imageElement
      ? [
          (cxNorm * CANVAS_SIZE - offsetX) / displayW,
          (cyNorm * CANVAS_SIZE - offsetY) / displayH,
        ]
      : [cxNorm, cyNorm];

  const LEGACY_BONE_ID: Record<string, string> = {
    head: 'head_top', neck: 'jaw', spine: 'collarbone', spine_lower: 'navel',
    hand_l: 'fingertip_l', hand_r: 'fingertip_r', ankle_l: 'heel_l', ankle_r: 'heel_r', hip: 'navel',
  };
  const resolveBoneId = (boneId: string) => LEGACY_BONE_ID[boneId] ?? boneId;
  const getPosition = (nodeId: string): [number, number] => {
    const resolved = resolveBoneId(nodeId);
    return nodeMap.get(resolved) ?? preset.nodes.find((n) => n.id === resolved)?.defaultPosition ?? [0.5, 0.5];
  };

  const useCanvasSkinning =
    isPreviewing &&
    preset.kind === 'human' &&
    imageElement &&
    bindPoseForSkinning &&
    bindPoseForSkinning.length > 0;

  const vertexWeightMap = vertexWeights?.length
    ? new Map(vertexWeights.map((vw) => [vw.vertexId, vw.weights]))
    : null;

  const bindMap = bindPoseForSkinning ? new Map(bindPoseForSkinning.map((n) => [n.id, n.position])) : null;

  const contourVertexMap = contourMesh?.vertices ? new Map(contourMesh.vertices.map((v) => [v.id, v])) : null;

  function getContourDeformedPosition(vertex: { id: string; position: [number, number]; weights: { boneId: string; weight: number }[] }): [number, number] {
    if (!bindMap) return vertex.position;
    let dx = 0, dy = 0;
    for (const { boneId, weight } of vertex.weights) {
      const rid = resolveBoneId(boneId);
      const bindPos = bindMap.get(rid) ?? getPosition(rid);
      const currPos = getPosition(rid);
      dx += weight * (currPos[0] - bindPos[0]);
      dy += weight * (currPos[1] - bindPos[1]);
    }
    return [vertex.position[0] + dx, vertex.position[1] + dy];
  }

  function getDisplayVertexPosition(vertexId: string): [number, number] {
    if (contourVertexMap) {
      const v = contourVertexMap.get(vertexId);
      if (v) return getContourDeformedPosition(v);
    }
    if (useCanvasSkinning && vertexWeightMap && bindMap) {
      const vBind = getMeshVertexPosition(vertexId, getPosition, bindMap);
      const weights = vertexWeightMap.get(vertexId);
      if (weights?.length) {
        let dx = 0, dy = 0;
        for (const { boneId, weight } of weights) {
          const rid = resolveBoneId(boneId);
          const bindPos = bindMap.get(rid) ?? getPosition(rid);
          const currPos = getPosition(rid);
          dx += weight * (currPos[0] - bindPos[0]);
          dy += weight * (currPos[1] - bindPos[1]);
        }
        return [vBind[0] + dx, vBind[1] + dy];
      }
    }
    return getMeshVertexPosition(vertexId, getPosition, null);
  }

  function getDeformedVertexPosition(vertexId: string): [number, number] {
    if (contourVertexMap) {
      const v = contourVertexMap.get(vertexId);
      if (v) return getContourDeformedPosition(v);
    }
    const bMap = new Map(bindPoseForSkinning!.map((n) => [n.id, n.position]));
    const vBind = getMeshVertexPosition(vertexId, getPosition, bMap);
    if (!vertexWeightMap) {
      return getMeshVertexPosition(vertexId, getPosition, null);
    }
    const weights = vertexWeightMap.get(vertexId);
    if (!weights?.length) {
      return getMeshVertexPosition(vertexId, getPosition, null);
    }
    let dx = 0, dy = 0;
    for (const { boneId, weight } of weights) {
      const rid = resolveBoneId(boneId);
      const bindPos = bMap.get(rid) ?? getPosition(rid);
      const currPos = getPosition(rid);
      dx += weight * (currPos[0] - bindPos[0]);
      dy += weight * (currPos[1] - bindPos[1]);
    }
    return [vBind[0] + dx, vBind[1] + dy];
  }

  const meshTriangles = contourMesh?.triangles ?? HUMAN_MESH_TRIANGLES;

  useEffect(() => {
    if (!useCanvasSkinning || !canvasRef.current || !imageElement || !bindPoseForSkinning?.length) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    const bMap = new Map(bindPoseForSkinning.map((n) => [n.id, n.position]));
    const imgW = imageElement.naturalWidth || 1;
    const imgH = imageElement.naturalHeight || 1;
    const scale = Math.min(CANVAS_SIZE / imgW, CANVAS_SIZE / imgH);
    const displayW = imgW * scale;
    const displayH = imgH * scale;
    const offsetX = (CANVAS_SIZE - displayW) / 2;
    const offsetY = (CANVAS_SIZE - displayH) / 2;
    const normToDest = (nx: number, ny: number): [number, number] => [
      offsetX + nx * displayW,
      offsetY + ny * displayH,
    ];
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    const getBindPos = (id: string) => contourVertexMap?.get(id)?.position ?? getMeshVertexPosition(id, getPosition, bMap);
    const OVERLAP = 1;
    for (const [id1, id2, id3] of meshTriangles) {
      const b1 = getBindPos(id1);
      const b2 = getBindPos(id2);
      const b3 = getBindPos(id3);
      const d1 = getDeformedVertexPosition(id1);
      const d2 = getDeformedVertexPosition(id2);
      const d3 = getDeformedVertexPosition(id3);
      const s0: [number, number] = [b1[0] * imgW, b1[1] * imgH];
      const s1: [number, number] = [b2[0] * imgW, b2[1] * imgH];
      const s2: [number, number] = [b3[0] * imgW, b3[1] * imgH];
      const dest0Orig = normToDest(d1[0], d1[1]);
      const dest1Orig = normToDest(d2[0], d2[1]);
      const dest2Orig = normToDest(d3[0], d3[1]);
      const T = getAffineFromTri(s0, s1, s2, dest0Orig, dest1Orig, dest2Orig);
      const cx = (dest0Orig[0] + dest1Orig[0] + dest2Orig[0]) / 3;
      const cy = (dest0Orig[1] + dest1Orig[1] + dest2Orig[1]) / 3;
      const expand = (p: [number, number]) => {
        const dx = p[0] - cx;
        const dy = p[1] - cy;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        return [p[0] + (dx / len) * OVERLAP, p[1] + (dy / len) * OVERLAP] as [number, number];
      };
      const dest0 = expand(dest0Orig);
      const dest1 = expand(dest1Orig);
      const dest2 = expand(dest2Orig);
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(dest0[0], dest0[1]);
      ctx.lineTo(dest1[0], dest1[1]);
      ctx.lineTo(dest2[0], dest2[1]);
      ctx.closePath();
      ctx.clip();
      ctx.setTransform(T.a, T.b, T.c, T.d, T.e, T.f);
      ctx.drawImage(imageElement, 0, 0, imgW, imgH);
      ctx.restore();
    }
  }, [useCanvasSkinning, nodes, bindPoseForSkinning, imageElement, preset.kind, vertexWeights, contourMesh]);

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
    const cxNorm = (e.clientX - rect.left) / rect.width;
    const cyNorm = (e.clientY - rect.top) / rect.height;
    const [imgNormX, imgNormY] = containerToImageNorm(cxNorm, cyNorm);
    const clampedX = Math.max(0, Math.min(1, imgNormX));
    const clampedY = Math.max(0, Math.min(1, imgNormY));
    onNodesChange(
      nodes.map((n) => (n.id === nodeId ? { id: n.id, position: [clampedX, clampedY] as [number, number] } : n))
    );
  };

  const handlePointerUp = (e: React.PointerEvent, nodeId: string) => {
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    if (draggingId === nodeId) onDraggingChange(null);
  };

  const handleVertexPointerDown = (e: React.PointerEvent, vertexId: string) => {
    if (!onContourVertexMove || isPreviewing) return;
    e.preventDefault();
    setDraggingVertexId(vertexId);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleVertexPointerMove = (e: React.PointerEvent, vertexId: string) => {
    if (draggingVertexId !== vertexId || !onContourVertexMove || !containerRef) return;
    const rect = containerRef.getBoundingClientRect();
    const cxNorm = (e.clientX - rect.left) / rect.width;
    const cyNorm = (e.clientY - rect.top) / rect.height;
    const [imgNormX, imgNormY] = containerToImageNorm(cxNorm, cyNorm);
    const clampedX = Math.max(0, Math.min(1, imgNormX));
    const clampedY = Math.max(0, Math.min(1, imgNormY));
    onContourVertexMove(vertexId, [clampedX, clampedY]);
  };

  const handleVertexPointerUp = (e: React.PointerEvent, vertexId: string) => {
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    if (draggingVertexId === vertexId) setDraggingVertexId(null);
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
      {useCanvasSkinning ? (
        <canvas
          ref={canvasRef}
          width={CANVAS_SIZE}
          height={CANVAS_SIZE}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
          }}
        />
      ) : imageDataUrl ? (
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
            transform: `translate(${imageTranslate[0] * 100}%, ${imageTranslate[1] * 100}%)`,
            transition: 'none',
          }}
        />
      ) : null}
      <svg
        width="100%"
        height="100%"
        style={{ position: 'absolute', left: 0, top: 0 }}
        viewBox={`0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}`}
      >
        {/* 蒙皮网格边界与顶点权重可视化 */}
        {showMeshWeights && preset.kind === 'human' && (
          <>
            <g pointerEvents="none">
              {meshTriangles.map(([id1, id2, id3], i) => {
                const p1 = getDisplayVertexPosition(id1);
                const p2 = getDisplayVertexPosition(id2);
                const p3 = getDisplayVertexPosition(id3);
                const [x1, y1] = normToDisplay(p1[0], p1[1]);
                const [x2, y2] = normToDisplay(p2[0], p2[1]);
                const [x3, y3] = normToDisplay(p3[0], p3[1]);
                return (
                  <g key={i}>
                    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(255,193,7,0.9)" strokeWidth={2} />
                    <line x1={x2} y1={y2} x2={x3} y2={y3} stroke="rgba(255,193,7,0.9)" strokeWidth={2} />
                    <line x1={x3} y1={y3} x2={x1} y2={y1} stroke="rgba(255,193,7,0.9)" strokeWidth={2} />
                  </g>
                );
              })}
            </g>
            <g pointerEvents={onContourVertexMove && contourMesh ? 'auto' : 'none'}>
            {(() => {
              const vertIds = new Set<string>();
              meshTriangles.forEach(([a, b, c]) => { vertIds.add(a); vertIds.add(b); vertIds.add(c); });
              const boneColor = '#1890ff';
              return Array.from(vertIds).map((vid) => {
                const pos = getDisplayVertexPosition(vid);
                const [cx, cy] = normToDisplay(pos[0], pos[1]);
                const weights = contourVertexMap?.get(vid)?.weights ?? vertexWeightMap?.get(vid);
                const primary = weights?.[0];
                const isBone = isBoneVertex(vid);
                const regionLabel = primary ? getRegionLabel(resolveBoneId(primary.boneId)) : null;
                const color = isBone ? boneColor : (primary ? getRegionColor(resolveBoneId(primary.boneId)) : '#868e96');
                const weightText = weights?.map((w) => `${w.boneId}:${(w.weight * 100).toFixed(0)}%`).join(' ');
                const canDrag = onContourVertexMove && contourMesh;
                const titleParts = [
                  isBone
                    ? (preset.nodes.find((x) => x.id === (vid.startsWith('s_') ? vid.slice(2) : vid))?.label ?? vid)
                    : (regionLabel && primary ? `${regionLabel} (${(primary.weight * 100).toFixed(0)}%)` : vid),
                  weightText ? `权重: ${weightText}` : null,
                  canDrag ? '可拖拽微调' : null,
                ].filter(Boolean);
                const size = isBone ? 3 : (canDrag ? 8 : 5);
                return (
                  <g key={vid}>
                    {isBone ? (
                      <polygon
                        points={`${cx},${cy - size} ${cx + size},${cy} ${cx},${cy + size} ${cx - size},${cy}`}
                        fill={color}
                        stroke="#fff"
                        strokeWidth={1}
                        style={
                          canDrag
                            ? { cursor: isPreviewing ? 'default' : 'grab', pointerEvents: 'auto' as const }
                            : undefined
                        }
                        onPointerDown={canDrag ? (e) => handleVertexPointerDown(e, vid) : undefined}
                        onPointerMove={canDrag ? (e) => handleVertexPointerMove(e, vid) : undefined}
                        onPointerUp={canDrag ? (e) => handleVertexPointerUp(e, vid) : undefined}
                        onPointerLeave={canDrag ? (e) => handleVertexPointerUp(e, vid) : undefined}
                      />
                    ) : (
                      <circle
                        cx={cx}
                        cy={cy}
                        r={size}
                        fill={color}
                        stroke="#fff"
                        strokeWidth={1}
                        style={
                          canDrag
                            ? { cursor: isPreviewing ? 'default' : 'grab', pointerEvents: 'auto' as const }
                            : undefined
                        }
                        onPointerDown={canDrag ? (e) => handleVertexPointerDown(e, vid) : undefined}
                        onPointerMove={canDrag ? (e) => handleVertexPointerMove(e, vid) : undefined}
                        onPointerUp={canDrag ? (e) => handleVertexPointerUp(e, vid) : undefined}
                        onPointerLeave={canDrag ? (e) => handleVertexPointerUp(e, vid) : undefined}
                      />
                    )}
                    <title>{titleParts.join('\n')}</title>
                  </g>
                );
              });
            })()}
            </g>
          </>
        )}
        {/* 骨骼连线（绿色） */}
        {showSkeleton && (
          <g pointerEvents="none">
            {preset.edges.map((edge, i) => {
              const from = getPosition(edge.from);
              const to = getPosition(edge.to);
              const [x1, y1] = normToDisplay(from[0], from[1]);
              const [x2, y2] = normToDisplay(to[0], to[1]);
              return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#52c41a" strokeWidth={2} />;
            })}
          </g>
        )}
        {/* 骨骼节点（蓝色圆点，可拖拽） */}
        {showSkeleton &&
          preset.nodes.map((n) => {
            const pos = getPosition(n.id);
            const [cx, cy] = normToDisplay(pos[0], pos[1]);
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
