/**
 * 抠图设置面板：可拖拽 header、无遮罩，支持撤销
 * 支持 AI 模型抠图与即时透明（四角采样背景色）
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Button, Space, Typography, Select, InputNumber, App, Checkbox, Slider } from 'antd';
import { CloseOutlined, ScissorOutlined, UndoOutlined, CheckOutlined } from '@ant-design/icons';
import { useConfigSubscribe } from '@/contexts/ConfigContext';
import { instantTransparencyFromDataUrl, getInstantTransparencyPreviewDataUrl } from '@/utils/instantTransparencyMatting';

const { Text } = Typography;

const MATTING_MODE_OPTIONS = [
  { value: 'instant', label: '即时透明' },
  { value: 'model', label: 'AI 模型' },
];

const LOCAL_MATTING_OPTIONS: { value: string; label: string }[] = [
  { value: 'rvm', label: 'RVM（极低精度）' },
  { value: 'birefnet', label: 'BiRefNet（中精度）' },
  { value: 'mvanet', label: 'MVANet（中精度）' },
  { value: 'u2netp', label: 'U2NetP（低精度）' },
  { value: 'rmbg2', label: 'RMBG-2（高精度）' },
];

function buildMattingModelOptions(aiMattingConfigs?: { id: string; name?: string; provider: string; enabled?: boolean }[]): { value: string; label: string }[] {
  const ai = (aiMattingConfigs ?? []).filter((c) => c.enabled !== false).map((c) => ({
    value: c.id,
    label: c.name || (c.provider === 'volcengine' ? '火山引擎抠图' : c.provider),
  }));
  return [...ai, ...LOCAL_MATTING_OPTIONS];
}

export interface MattingSettingsPanelProps {
  open: boolean;
  onClose: () => void;
  itemId: string;
  projectDir: string;
  imagePath: string;
  getAssetDataUrl: (projectDir: string, path: string) => Promise<string | null>;
  saveAssetFromBase64: (projectDir: string, base64Data: string, ext?: string, type?: string, options?: { replaceAssetId?: string }) => Promise<{ ok: boolean; path?: string; error?: string }>;
  matteImageAndSave: (
    projectDir: string,
    path: string,
    options?: { mattingModel?: string; downsampleRatio?: number; replaceAssetId?: string }
  ) => Promise<{ ok: boolean; path?: string; error?: string }>;
  onPathChange: (itemId: string, newPath: string) => void;
  /** 指定时替换该素材的图片文件（不新建素材行） */
  replaceAssetId?: string;
}

export function MattingSettingsPanel({
  open,
  onClose,
  itemId,
  projectDir,
  imagePath,
  getAssetDataUrl,
  saveAssetFromBase64,
  matteImageAndSave,
  onPathChange,
  replaceAssetId,
}: MattingSettingsPanelProps) {
  const { message } = App.useApp();
  const config = useConfigSubscribe();

  const [mattingMode, setMattingMode] = useState<'instant' | 'model'>('instant');
  const [mattingModel, setMattingModel] = useState<string>('rvm');
  const [downsampleRatio, setDownsampleRatio] = useState(0.5);
  const [tolerance, setTolerance] = useState(30);
  const [contiguous, setContiguous] = useState(true);
  const [antiAliasing, setAntiAliasing] = useState(true);
  const [feather, setFeather] = useState(0);
  const [loading, setLoading] = useState(false);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const previewAbortRef = useRef<number>(0);
  /** 抠图结果：展示用 dataUrl；确认时用于替换 */
  const [mattedResult, setMattedResult] = useState<{ dataUrl: string; path?: string; base64?: string } | null>(null);
  /** 抠图成功后的原路径，用于撤销 */
  const [originalPath, setOriginalPath] = useState<string | null>(null);

  const [pos, setPos] = useState({ x: 80, y: 80 });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; initX: number; initY: number } | null>(null);

  const modelOptions = buildMattingModelOptions(config?.aiMattingConfigs);

  const handleHeaderPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      dragRef.current = { startX: e.clientX, startY: e.clientY, initX: pos.x, initY: pos.y };
      setIsDragging(true);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [pos]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      setPos({ x: dragRef.current.initX + dx, y: dragRef.current.initY + dy });
    },
    []
  );

  const handlePointerUp = useCallback(() => {
    dragRef.current = null;
    setIsDragging(false);
  }, []);

  const handleExecute = useCallback(async () => {
    if (!imagePath) return;
    setLoading(true);
    setMattedResult(null);
    try {
      if (mattingMode === 'instant') {
        const dataUrl = await getAssetDataUrl(projectDir, imagePath);
        if (!dataUrl) {
          message.error('无法加载图片');
          return;
        }
        let base64: string;
        try {
          base64 = await instantTransparencyFromDataUrl(dataUrl, {
            tolerance,
            contiguous,
            antiAliasing,
            feather,
          });
        } catch (e) {
          message.error(e instanceof Error ? e.message : '抠图处理失败');
          return;
        }
        const mattedDataUrl = `data:image/png;base64,${base64}`;
        setMattedResult({ dataUrl: mattedDataUrl, base64 });
        message.success('抠图完成，请确认后替换');
      } else {
        const res = await matteImageAndSave(projectDir, imagePath, {
          mattingModel,
          downsampleRatio: mattingModel === 'rvm' ? downsampleRatio : undefined,
          replaceAssetId,
        });
        if (res.ok && res.path) {
          const mattedDataUrl = await getAssetDataUrl(projectDir, res.path);
          setMattedResult({ dataUrl: mattedDataUrl ?? '', path: res.path });
          message.success('抠图完成，请确认后替换');
        } else {
          message.error(res.error ?? '抠图失败');
        }
      }
    } finally {
      setLoading(false);
    }
  }, [
    itemId,
    projectDir,
    imagePath,
    mattingMode,
    tolerance,
    contiguous,
    antiAliasing,
    feather,
    mattingModel,
    downsampleRatio,
    getAssetDataUrl,
    saveAssetFromBase64,
    matteImageAndSave,
    onPathChange,
    message,
  ]);

  const handleConfirmReplace = useCallback(async () => {
    if (!mattedResult) return;
    if (mattedResult.path) {
      setOriginalPath(imagePath);
      onPathChange(itemId, mattedResult.path);
      setMattedResult(null);
      message.success('已替换，可点击撤销恢复原图');
    } else if (mattedResult.base64) {
      const res = await saveAssetFromBase64(projectDir, mattedResult.base64, '.png', 'character', replaceAssetId ? { replaceAssetId } : undefined);
      if (res.ok && res.path) {
        setOriginalPath(imagePath);
        onPathChange(itemId, res.path);
        setMattedResult(null);
        message.success('已替换，可点击撤销恢复原图');
      } else {
        message.error(res.error ?? '保存失败');
      }
    }
  }, [itemId, projectDir, imagePath, mattedResult, saveAssetFromBase64, onPathChange, message, replaceAssetId]);

  const handleUndo = useCallback(() => {
    if (originalPath) {
      onPathChange(itemId, originalPath);
      setOriginalPath(null);
      message.success('已撤销，恢复原图');
    }
  }, [itemId, originalPath, onPathChange, message]);

  useEffect(() => {
    if (!open) {
      setOriginalPath(null);
      setMattedResult(null);
      setPreviewDataUrl(null);
      setPreviewError(null);
    }
  }, [open]);

  useEffect(() => {
    if (mattingMode !== 'instant' || !imagePath || !open) {
      setPreviewDataUrl(null);
      return;
    }
    const id = ++previewAbortRef.current;
    const t = setTimeout(async () => {
      setPreviewError(null);
      try {
        const dataUrl = await getAssetDataUrl(projectDir, imagePath);
        if (!dataUrl || id !== previewAbortRef.current) return;
        const url = await getInstantTransparencyPreviewDataUrl(dataUrl, {
          tolerance,
          contiguous,
          antiAliasing,
          feather,
        });
        if (id === previewAbortRef.current) setPreviewDataUrl(url);
      } catch (e) {
        if (id === previewAbortRef.current) {
          setPreviewError(e instanceof Error ? e.message : '预览失败');
          setPreviewDataUrl(null);
        }
      }
    }, 150);
    return () => clearTimeout(t);
  }, [mattingMode, imagePath, open, projectDir, getAssetDataUrl, tolerance, contiguous, antiAliasing, feather]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label="抠图设置"
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        zIndex: 1050,
        width: 320,
        background: 'rgba(30, 30, 30, 0.98)',
        border: '1px solid rgba(255,255,255,0.15)',
        borderRadius: 8,
        boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
        overflow: 'hidden',
      }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      <div
        style={{
          padding: '8px 12px',
          cursor: isDragging ? 'grabbing' : 'grab',
          userSelect: 'none',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
        onPointerDown={handleHeaderPointerDown}
      >
        <Text strong>抠图设置</Text>
        <Button
          type="text"
          size="small"
          icon={<CloseOutlined />}
          onClick={onClose}
          onPointerDown={(e) => e.stopPropagation()}
          style={{ color: 'rgba(255,255,255,0.65)' }}
        />
      </div>

      <div style={{ padding: 12 }}>
        <Space orientation="vertical" style={{ width: '100%' }} size="small">
          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>抠图方式</Text>
            <Select
              value={mattingMode}
              onChange={(v) => setMattingMode((v as 'instant' | 'model') ?? 'instant')}
              options={MATTING_MODE_OPTIONS}
              style={{ width: '100%', marginTop: 4 }}
            />
          </div>

          {mattingMode === 'instant' && (
            <>
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>选区预览（红色区域将变透明）</Text>
                <div
                  style={{
                    marginTop: 4,
                    width: '100%',
                    maxHeight: 140,
                    background: 'rgba(0,0,0,0.3)',
                    borderRadius: 4,
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {previewError ? (
                    <Text type="secondary" style={{ fontSize: 12 }}>{previewError}</Text>
                  ) : previewDataUrl ? (
                    <img
                      src={previewDataUrl}
                      alt="选区预览"
                      style={{ maxWidth: '100%', maxHeight: 136, objectFit: 'contain' }}
                    />
                  ) : (
                    <Text type="secondary" style={{ fontSize: 12 }}>加载中…</Text>
                  )}
                </div>
              </div>
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>容差 (0–255)</Text>
                <Slider
                  min={0}
                  max={255}
                  value={tolerance}
                  onChange={setTolerance}
                  style={{ marginTop: 4 }}
                />
              </div>
              <Checkbox checked={contiguous} onChange={(e) => setContiguous(e.target.checked)}>
                连续（仅选与角连通的区域）
              </Checkbox>
              <Checkbox checked={antiAliasing} onChange={(e) => setAntiAliasing(e.target.checked)}>
                抗锯齿
              </Checkbox>
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>羽化 (px)</Text>
                <InputNumber
                  min={0}
                  max={20}
                  value={feather}
                  onChange={(v) => setFeather(v ?? 0)}
                  style={{ width: '100%', marginTop: 4 }}
                />
              </div>
            </>
          )}

          {mattingMode === 'model' && (
            <>
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>抠图模型</Text>
                <Select
                  value={mattingModel}
                  onChange={(v) => setMattingModel(v ?? 'rvm')}
                  options={modelOptions}
                  style={{ width: '100%', marginTop: 4 }}
                />
              </div>
              {mattingModel === 'rvm' && (
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>下采样比</Text>
                  <InputNumber
                    min={0.125}
                    max={1}
                    step={0.125}
                    value={downsampleRatio}
                    onChange={(v) => setDownsampleRatio(v ?? 0.5)}
                    style={{ width: '100%', marginTop: 4 }}
                  />
                </div>
              )}
            </>
          )}

          <Space>
            <Button
              type="primary"
              icon={<ScissorOutlined />}
              onClick={handleExecute}
              loading={loading}
            >
              抠图
            </Button>
            {originalPath && (
              <Button icon={<UndoOutlined />} onClick={handleUndo}>
                撤销
              </Button>
            )}
          </Space>

          {mattedResult && (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>抠图结果</Text>
              <div
                style={{
                  width: '100%',
                  maxHeight: 120,
                  background: 'rgba(0,0,0,0.3)',
                  borderRadius: 4,
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 8,
                }}
              >
                {mattedResult.dataUrl ? (
                  <img
                    src={mattedResult.dataUrl}
                    alt="抠图结果"
                    style={{ maxWidth: '100%', maxHeight: 116, objectFit: 'contain' }}
                  />
                ) : (
                  <Text type="secondary" style={{ fontSize: 12 }}>已生成</Text>
                )}
              </div>
              <Button
                type="primary"
                icon={<CheckOutlined />}
                onClick={handleConfirmReplace}
                block
              >
                确认替换
              </Button>
            </div>
          )}
        </Space>
      </div>
    </div>
  );
}
