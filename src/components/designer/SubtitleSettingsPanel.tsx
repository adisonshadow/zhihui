/**
 * 字幕设置面板：字幕内容编辑 + 字幕样式设置
 * 字幕内容：列表项（说话人、开始秒、字幕内容）
 * 字幕样式：字号、字体、粗细、颜色、描边颜色、描边粗细、水平边距、底部边距
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Input, InputNumber, Button, Typography, Select, ColorPicker, Flex, App, Empty, Radio } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import type { ProjectInfo } from '@/hooks/useProject';
import type { BlockSettingsTab } from './SelectedBlockSettings';

const { Text } = Typography;

const GENERIC_FONTS = ['serif', 'sans-serif', 'cursive', 'monospace', 'system-ui'];

export interface SubtitleItem {
  speaker?: string;
  startTime: number;
  /** 持续时间（秒），默认 2 */
  duration: number;
  content: string;
}

export type SubtitleFontWeight = 'light' | 'normal' | 'bold';

export interface SubtitleStyle {
  fontSize: number;
  fontFamily: string;
  fontWeight: SubtitleFontWeight;
  color: string;
  shadowColor: string;
  shadowSize: number;
  paddingX: number;
  paddingBottom: number;
}

export interface SubtitleConfig {
  items: SubtitleItem[];
  style: SubtitleStyle;
}

const DEFAULT_STYLE: SubtitleStyle = {
  fontSize: 78,
  fontFamily: 'sans-serif',
  fontWeight: 'normal',
  color: '#ffffff',
  shadowColor: '#000000',
  shadowSize: 6,
  paddingX: 30,
  paddingBottom: 60,
};

interface SubtitleSettingsPanelProps {
  project: ProjectInfo;
  sceneId: string | null;
  currentTime: number;
  refreshKey?: number;
  settingsTab?: BlockSettingsTab;
  onUpdate?: () => void;
}

export function SubtitleSettingsPanel({ project, sceneId, currentTime, refreshKey, settingsTab = 'subtitle', onUpdate }: SubtitleSettingsPanelProps) {
  const { message } = App.useApp();
  const projectDir = project.project_dir;
  const [config, setConfig] = useState<SubtitleConfig>({ items: [], style: { ...DEFAULT_STYLE } });
  const [loading, setLoading] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadConfig = useCallback(async () => {
    if (!sceneId || !window.yiman?.project?.getScene) return;
    setLoading(true);
    try {
      const row = await window.yiman.project.getScene(projectDir, sceneId);
      if (row?.subtitle_config) {
        try {
          const parsed = JSON.parse(row.subtitle_config) as SubtitleConfig;
          const rawItems = parsed.items ?? [];
          const items = rawItems.map((it) => {
            const raw = it as { startTime: number; endTime?: number; duration?: number };
            const duration = typeof raw.duration === 'number' ? raw.duration
              : typeof raw.endTime === 'number' ? Math.max(0.1, raw.endTime - raw.startTime) : 2;
            return { ...it, duration };
          });
          setConfig({
            items,
            style: { ...DEFAULT_STYLE, ...parsed.style },
          });
        } catch {
          setConfig({ items: [], style: { ...DEFAULT_STYLE } });
        }
      } else {
        setConfig({ items: [], style: { ...DEFAULT_STYLE } });
      }
    } finally {
      setLoading(false);
    }
  }, [projectDir, sceneId]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig, refreshKey]);

  const saveConfig = useCallback(async (newConfig: SubtitleConfig) => {
    if (!sceneId || !window.yiman?.project?.updateScene) return;
    try {
      const res = await window.yiman.project.updateScene(projectDir, sceneId, {
        subtitle_config: JSON.stringify(newConfig),
      });
      if (res?.ok) {
        onUpdate?.();
      } else {
        message.error(res?.error || '保存失败');
      }
    } catch {
      message.error('保存失败');
    }
  }, [projectDir, sceneId, message, onUpdate]);

  const scheduleSave = useCallback((newConfig: SubtitleConfig) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => saveConfig(newConfig), 400);
  }, [saveConfig]);

  const updateItems = useCallback((items: SubtitleItem[]) => {
    const newConfig = { ...config, items };
    setConfig(newConfig);
    scheduleSave(newConfig);
  }, [config, scheduleSave]);

  const updateStyle = useCallback((partial: Partial<SubtitleStyle>) => {
    const newConfig = { ...config, style: { ...config.style, ...partial } };
    setConfig(newConfig);
    scheduleSave(newConfig);
  }, [config, scheduleSave]);

  const addItem = useCallback(() => {
    const lastItem = config.items[config.items.length - 1];
    const startTime = lastItem ? Math.round((lastItem.startTime + lastItem.duration + 0.1) * 100) / 100 : Math.round(currentTime * 100) / 100;
    updateItems([...config.items, { speaker: '', startTime, duration: 2, content: '' }]);
  }, [config.items, currentTime, updateItems]);

  const removeItem = useCallback((index: number) => {
    updateItems(config.items.filter((_, i) => i !== index));
  }, [config.items, updateItems]);

  const updateItem = useCallback((index: number, field: keyof SubtitleItem, value: string | number) => {
    const items = [...config.items];
    items[index] = { ...items[index], [field]: value };
    updateItems(items);
  }, [config.items, updateItems]);

  if (loading) {
    return <Text type="secondary">加载中...</Text>;
  }

  if (settingsTab === 'subtitle-style') {
    return (
      <SubtitleStyleEditor style={config.style} onStyleChange={updateStyle} />
    );
  }

  return (
    <Flex vertical gap={12}>
      {config.items.length === 0 ? (
        <Empty description="暂无字幕" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        config.items
          .slice()
          .sort((a, b) => a.startTime - b.startTime)
          .map((item, sortedIdx) => {
            const origIdx = config.items.indexOf(item);
            return (
              <div
                key={origIdx}
                style={{
                  padding: '8px 10px',
                  borderRadius: 6,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <Flex gap={8} align="center" style={{ marginBottom: 6 }}>
                  <Input
                    size="small"
                    placeholder="说话人（可选）"
                    value={item.speaker ?? ''}
                    onChange={(e) => updateItem(origIdx, 'speaker', e.target.value)}
                    style={{ width: 100 }}
                  />
                  <InputNumber
                    size="small"
                    placeholder="开始秒"
                    value={item.startTime}
                    min={0}
                    step={0.1}
                    onChange={(v) => updateItem(origIdx, 'startTime', v ?? 0)}
                    style={{ width: 80 }}
                    suffix="s"
                  />
                  <InputNumber
                    size="small"
                    placeholder="持续时间"
                    value={item.duration}
                    min={0.1}
                    step={0.1}
                    onChange={(v) => updateItem(origIdx, 'duration', v ?? 2)}
                    style={{ width: 80 }}
                    suffix="s"
                  />
                  <Button
                    size="small"
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => removeItem(origIdx)}
                  />
                </Flex>
                <Input.TextArea
                  size="small"
                  placeholder="字幕内容"
                  value={item.content}
                  onChange={(e) => updateItem(origIdx, 'content', e.target.value)}
                  autoSize={{ minRows: 1, maxRows: 3 }}
                />
              </div>
            );
          })
      )}
      <Button
        type="dashed"
        icon={<PlusOutlined />}
        onClick={addItem}
        block
        size="small"
      >
        添加字幕
      </Button>
    </Flex>
  );
}

const FONT_WEIGHT_OPTIONS: { value: SubtitleFontWeight; label: string }[] = [
  { value: 'light', label: '细' },
  { value: 'normal', label: '正常' },
  { value: 'bold', label: '粗' },
];

function SubtitleStyleEditor({ style, onStyleChange }: { style: SubtitleStyle; onStyleChange: (partial: Partial<SubtitleStyle>) => void }) {
  const [systemFonts, setSystemFonts] = useState<string[]>([]);
  useEffect(() => {
    if (!window.yiman?.system?.getFonts) return;
    window.yiman.system.getFonts().then((list) => setSystemFonts(list ?? [])).catch(() => {});
  }, []);

  return (
    <Flex vertical gap={16} style={{ padding: '4px 0' }}>
      <Flex align="center" justify="space-between">
        <Text>字号</Text>
        <InputNumber
          size="small"
          value={style.fontSize}
          min={50}
          max={200}
          onChange={(v) => onStyleChange({ fontSize: v ?? 78 })}
          style={{ width: 80 }}
          suffix="px"
        />
      </Flex>
      <Flex align="center" justify="space-between">
        <Text>字体</Text>
        <Select
          size="small"
          value={style.fontFamily ?? 'sans-serif'}
          onChange={(v) => onStyleChange({ fontFamily: v ?? 'sans-serif' })}
          placeholder="选择字体"
          showSearch
          allowClear={false}
          optionFilterProp="label"
          style={{ width: 180 }}
          options={[
            ...GENERIC_FONTS.map((f) => ({ value: f, label: f })),
            ...systemFonts
              .filter((s) => !GENERIC_FONTS.includes(s))
              .map((f) => ({ value: f, label: f })),
            ...(style.fontFamily && !GENERIC_FONTS.includes(style.fontFamily) && !systemFonts.includes(style.fontFamily)
              ? [{ value: style.fontFamily, label: style.fontFamily }]
              : []),
          ]}
        />
      </Flex>
      <Flex align="center" justify="space-between">
        <Text>粗细</Text>
        <Radio.Group
          size="small"
          optionType="button"
          buttonStyle="solid"
          value={style.fontWeight ?? 'normal'}
          onChange={(e) => onStyleChange({ fontWeight: e.target.value })}
          options={FONT_WEIGHT_OPTIONS}
        />
      </Flex>
      <Flex align="center" justify="space-between">
        <Text>文字颜色</Text>
        <ColorPicker
          size="small"
          value={style.color}
          onChange={(c) => onStyleChange({ color: c.toHexString() })}
        />
      </Flex>
      <Flex align="center" justify="space-between">
        <Text>描边颜色</Text>
        <ColorPicker
          size="small"
          value={style.shadowColor}
          onChange={(c) => onStyleChange({ shadowColor: c.toHexString() })}
        />
      </Flex>
      <Flex align="center" justify="space-between">
        <Text>描边粗细</Text>
        <InputNumber
          size="small"
          value={style.shadowSize}
          min={4}
          max={16}
          step={1}
          onChange={(v) => onStyleChange({ shadowSize: v ?? 6 })}
          style={{ width: 80 }}
          suffix="px"
        />
      </Flex>
      <Flex align="center" justify="space-between">
        <Text>左右边距</Text>
        <InputNumber
          size="small"
          value={style.paddingX}
          min={0}
          max={200}
          onChange={(v) => onStyleChange({ paddingX: v ?? 30 })}
          style={{ width: 80 }}
          suffix="px"
        />
      </Flex>
      <Flex align="center" justify="space-between">
        <Text>底部边距</Text>
        <InputNumber
          size="small"
          value={style.paddingBottom}
          min={0}
          max={200}
          onChange={(v) => onStyleChange({ paddingBottom: v ?? 60 })}
          style={{ width: 80 }}
          suffix="px"
        />
      </Flex>
    </Flex>
  );
}
