/**
 * 从内置 PresetVoice/ 与外置目录中选择音频：常用置顶 + 合并列表 + 试听
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App, Button, Empty, Flex, Input, List, Modal, Space, Typography } from 'antd';
import { CheckOutlined, PlayCircleOutlined, StarFilled, StopOutlined } from '@ant-design/icons';

import type { AudiobookSavedVoiceSample } from '@/types/settings';
import { useConfigSubscribe } from '@/contexts/ConfigContext';
import {
  normalizedAudiobookVoiceRelKey,
  savedVoiceRelativePathSet,
  sortSavedVoiceSamplesByCreatedAtDesc,
} from '@/audiobook/utils/audiobookSavedVoiceSamples';
import { listMergedPresetVoiceSamples } from '@/audiobook/utils/listMergedPresetVoiceSamples';
import { formatVoiceSampleDisplayName } from '@/audiobook/utils/embeddedPresetVoiceId';

const { Text } = Typography;

/** 拼接到根目录前的相对路径（保留大小写） */
function cleanRelativePathForJoin(p: string): string {
  return p.trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/^[/\\]/, '');
}

export type VoiceSamplePickResult = {
  relativePath: string;
};

export interface VoiceSampleLookupModalProps {
  open: boolean;
  /** 内置 + 外置样本扫描根目录（去重后的绝对路径列表） */
  presetScanRootDirs: string[];
  /** 「音色设计库」条目与 .yiman-voices 相对路径解析目录 */
  customRootDir: string;
  title: string;
  onCancel: () => void;
  onSelect: (result: VoiceSamplePickResult) => void;
}

type DirRow = { relativePath: string; absolutePath: string };
type FavResolved = AudiobookSavedVoiceSample & { absolutePath: string };

export function VoiceSampleLookupModal({
  open,
  presetScanRootDirs,
  customRootDir,
  title,
  onCancel,
  onSelect,
}: VoiceSampleLookupModalProps) {
  const { message } = App.useApp();
  const config = useConfigSubscribe();
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState<DirRow[]>([]);
  const [query, setQuery] = useState('');
  const [playingAbs, setPlayingAbs] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [favoritesResolved, setFavoritesResolved] = useState<FavResolved[]>([]);

  const savedSorted = useMemo(
    () => sortSavedVoiceSamplesByCreatedAtDesc(config?.audiobook?.savedVoiceSamples),
    [config?.audiobook?.savedVoiceSamples],
  );

  const favPaths = useMemo(
    () => savedVoiceRelativePathSet(savedSorted),
    [savedSorted],
  );

  const scanRootsKey = useMemo(
    () => presetScanRootDirs.map((d) => d.trim()).filter(Boolean).join('\0'),
    [presetScanRootDirs],
  );

  const stopPreview = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
    setPlayingAbs(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function resolveFavorites() {
      const trimmed = customRootDir.trim();
      const join = window.yiman?.fs?.pathJoin;
      if (!open || !trimmed || !join) {
        if (!cancelled) setFavoritesResolved([]);
        return;
      }
      const out: FavResolved[] = [];
      for (const s of savedSorted) {
        const cleanRel = cleanRelativePathForJoin(s.relativePath);
        if (!cleanRel) continue;
        try {
          const abs = await join(trimmed, cleanRel);
          if (!cancelled) out.push({ ...s, absolutePath: abs });
        } catch {
          /** 跳过无法拼接的条目 */
        }
      }
      if (!cancelled) setFavoritesResolved(out);
    }
    void resolveFavorites();
    return () => {
      cancelled = true;
    };
  }, [open, customRootDir, savedSorted]);

  const loadDirList = useCallback(async () => {
    const roots = scanRootsKey.split('\0').filter(Boolean);
    if (roots.length === 0) {
      setFiles([]);
      return;
    }
    setLoading(true);
    try {
      const res = await listMergedPresetVoiceSamples(roots);
      if (!res.ok) {
        message.error(res.error || '读取目录失败');
        setFiles([]);
        return;
      }
      setFiles(res.files.filter((f) => !favPaths.has(normalizedAudiobookVoiceRelKey(f.relativePath))));
    } catch (e) {
      message.error(e instanceof Error ? e.message : '读取目录失败');
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, [scanRootsKey, message, favPaths]);

  useEffect(() => {
    if (!open) {
      stopPreview();
      setQuery('');
      return;
    }
    void loadDirList();
  }, [open, loadDirList, stopPreview]);

  const filteredFav = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return favoritesResolved;
    return favoritesResolved.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        f.relativePath.toLowerCase().includes(q) ||
        (f.voiceDescription && f.voiceDescription.toLowerCase().includes(q)),
    );
  }, [favoritesResolved, query]);

  const filteredDir = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return files;
    return files.filter((f) => f.relativePath.toLowerCase().includes(q));
  }, [files, query]);

  const preview = async (absolutePath: string) => {
    if (playingAbs === absolutePath) {
      stopPreview();
      return;
    }
    stopPreview();
    const read = window.yiman?.fs?.readFileAsDataUrl;
    if (!read) {
      message.warning('无法试听（缺少文件读取接口）');
      return;
    }
    try {
      const dataUrl = await read(absolutePath);
      if (!dataUrl) {
        message.error('读取音频失败');
        return;
      }
      const a = new Audio(dataUrl);
      audioRef.current = a;
      a.onended = () => {
        audioRef.current = null;
        setPlayingAbs(null);
      };
      setPlayingAbs(absolutePath);
      await a.play();
    } catch {
      message.error('播放失败');
      setPlayingAbs(null);
      audioRef.current = null;
    }
  };

  const closeAll = () => {
    stopPreview();
    onCancel();
  };

  const pick = (relativePath: string) => {
    stopPreview();
    const norm = relativePath.trim().replace(/\\/g, '/');
    onSelect({ relativePath: norm });
  };

  const renderActions = (absolutePath: string, relativePath: string) => [
    <Button
      key="play"
      type="text"
      size="small"
      icon={playingAbs === absolutePath ? <StopOutlined /> : <PlayCircleOutlined />}
      onClick={() => void preview(absolutePath)}
    >
      {playingAbs === absolutePath ? '停止' : '试听'}
    </Button>,
    <Button
      key="pick"
      type="primary"
      size="small"
      icon={<CheckOutlined />}
      onClick={() => pick(relativePath)}
    >
      选择
    </Button>,
  ];

  const hasPreset = scanRootsKey.length > 0;
  const hasCustom = customRootDir.trim().length > 0;

  return (
    <Modal title={title} open={open} onCancel={closeAll} footer={null} width={720} destroyOnHidden>
      {!hasPreset && !hasCustom ?
        <Empty description="请先在 设置 → 有声书 中配置外置或自定义音色样本目录（内置 PresetVoice/ 将自动加载）" />
      : <>
          <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
            内置 <Text code>PresetVoice/</Text> 与外置目录样本会合并排序展示。LongCat 克隆请在样本同目录放置与 wav 同名的 UTF-8 文稿（
            <Text code>.txt</Text>）。
          </Text>
          <Input.Search
            allowClear
            placeholder="按名称或路径筛选…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ marginBottom: 12 }}
          />

          {hasCustom ?
            <>
              <Text strong style={{ display: 'block', marginBottom: 8 }}>
                音色设计库
              </Text>
              <List<FavResolved>
                style={{ maxHeight: 200, overflow: 'auto', marginBottom: 16 }}
                locale={{ emptyText: '暂无已保存的设计音色' }}
                dataSource={filteredFav}
                renderItem={(item) => (
                  <List.Item actions={renderActions(item.absolutePath, item.relativePath)}>
                    <Flex vertical gap={0}>
                      <Space size={8}>
                        <StarFilled style={{ color: 'var(--ant-color-warning)' }} />
                        <Text ellipsis style={{ maxWidth: 460 }} title={item.name}>
                          {formatVoiceSampleDisplayName(item.name)}
                        </Text>
                      </Space>
                      <Text type="secondary" ellipsis style={{ maxWidth: 520, fontSize: 12 }} title={item.relativePath}>
                        {item.relativePath}
                      </Text>
                    </Flex>
                  </List.Item>
                )}
              />
            </>
          : null}

          {hasPreset ?
            <>
              <Text strong style={{ display: 'block', marginBottom: 8 }}>
                音色样本
              </Text>
              <List
                loading={loading}
                style={{ maxHeight: 360, overflow: 'auto' }}
                locale={{ emptyText: loading ? '加载中…' : '未找到音频文件' }}
                dataSource={filteredDir}
                renderItem={(item) => (
                  <List.Item actions={renderActions(item.absolutePath, item.relativePath)}>
                    <Space orientation="vertical" size={0}>
                      <Text
                        ellipsis
                        style={{ maxWidth: 520 }}
                        title={item.relativePath}
                      >
                        {formatVoiceSampleDisplayName(item.relativePath)}
                      </Text>
                    </Space>
                  </List.Item>
                )}
              />
              {files.length >= 2000 ?
                <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
                  已达列表上限（2000 个文件），请缩小外置目录范围。
                </Text>
              : null}
            </>
          : null}
        </>
      }
    </Modal>
  );
}
