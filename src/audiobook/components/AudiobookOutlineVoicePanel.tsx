/**
 * 故事大纲：旁白 + 剧本角色 的音色样本绑定
 */
import { useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { Button, Empty, Flex, Space, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlayCircleOutlined, PauseCircleOutlined, ThunderboltOutlined, UserAddOutlined, RocketOutlined } from '@ant-design/icons';
import { useConfigSubscribe, useConfigModal } from '@/contexts/ConfigContext';
import type { NovelWorkspaceSnapshot } from '@/novelDesign/storage/novelWorkspaceStorage';
import { updateAudiobookOutlineVoiceSamples } from '@/novelDesign/storage/novelWorkspaceStorage';
import { VoiceSampleLookupModal } from './VoiceSampleLookupModal';

import { VoiceDesignGenerateModal } from './VoiceDesignGenerateModal';
import { VoiceEnrollmentModal } from './VoiceEnrollmentModal';
import {
  hasPresetVoiceSampleDirs,
  presetVoiceSampleScanRoots,
} from '@/audiobook/utils/audiobookVoiceSampleRoots';
import { formatOutlineVoiceBindingSummary } from '@/audiobook/utils/outlineVoiceBindingDisplay';
import {
  parseEmbeddedPresetVoiceIdFromPath,
  embeddedVoiceMatchesEngine,
} from '@/audiobook/utils/embeddedPresetVoiceId';
import { findVoiceEnrollmentEngines } from '@/components/tts/voiceCapabilityInference';
import { useAudiobookVoiceSampleRoots } from '@/audiobook/hooks/useAudiobookVoiceSampleRoots';
import { useVoiceSamplePreview } from '@/audiobook/hooks/useVoiceSamplePreview';

const { Text, Paragraph } = Typography;

export type OutlineVoiceLookupTarget = { kind: 'narrator' } | { kind: 'character'; characterId: string; label: string };

export interface AudiobookOutlineVoicePanelProps {
  workspace: NovelWorkspaceSnapshot;
  setWorkspace: Dispatch<SetStateAction<NovelWorkspaceSnapshot | null>>;
  /** 一键发到 AI Chat 后等待提交中的状态 */
  outlineVoiceAiPending?: boolean;
  /** 根据故事大纲自动补齐主要角色到 novelScript（由 AI 调工具） */
  onFillMainCharactersFromOutlineAi?: () => void;
  /** 增加角色到音色列表（由 AI 引导并调工具） */
  onAddCharacterToVoiceListAi?: () => void;
}

export function AudiobookOutlineVoicePanel({
  workspace,
  setWorkspace,
  outlineVoiceAiPending,
  onFillMainCharactersFromOutlineAi,
  onAddCharacterToVoiceListAi,
}: AudiobookOutlineVoicePanelProps) {
  const config = useConfigSubscribe();
  const { openConfigModal } = useConfigModal();
  const voiceRoots = useAudiobookVoiceSampleRoots(config?.audiobook);
  const presetScanRoots = useMemo(() => presetVoiceSampleScanRoots(voiceRoots), [voiceRoots]);
  const { toggle: toggleVoicePreview, isPlaying } = useVoiceSamplePreview(voiceRoots);
  const hasVoiceDirs = hasPresetVoiceSampleDirs(voiceRoots);
  const [lookup, setLookup] = useState<OutlineVoiceLookupTarget | null>(null);
  const [voiceDesign, setVoiceDesign] = useState<OutlineVoiceLookupTarget | null>(null);
  const [voiceEnrollment, setVoiceEnrollment] = useState<OutlineVoiceLookupTarget | null>(null);

  const binding = workspace.audiobookOutlineVoiceSamples ?? {};
  const characters = workspace.novelScript?.characters ?? [];
  const enrollmentEngines = useMemo(
    () => findVoiceEnrollmentEngines(config?.models ?? []),
    [config?.models],
  );

  const resolveEmbeddedMinimaxBinding = (relativePath: string) => {
    const embedded = parseEmbeddedPresetVoiceIdFromPath(relativePath);
    if (!embedded) return { cloudEngineId: '', cloudVoiceId: '' };
    const eng = enrollmentEngines.find((e) => embeddedVoiceMatchesEngine(embedded, e));
    if (!eng) return { cloudEngineId: '', cloudVoiceId: '' };
    return { cloudEngineId: eng.engineId, cloudVoiceId: embedded.voiceId };
  };

  const rows = useMemo(() => {
    const list: { key: string; label: string; rel?: string; target: OutlineVoiceLookupTarget }[] = [
      {
        key: 'narrator',
        label: '旁白',
        rel: binding.narratorRelPath,
        target: { kind: 'narrator' },
      },
    ];
    for (const c of characters) {
      list.push({
        key: c.id,
        label: `${c.name}（${c.id}）`,
        rel: binding.byCharacterId?.[c.id],
        target: { kind: 'character', characterId: c.id, label: c.name },
      });
    }
    return list;
  }, [binding, characters]);

  const columns: ColumnsType<(typeof rows)[number]> = [
    { title: '项', dataIndex: 'label', key: 'label', width: 160 },
    {
      title: '当前样本',
      dataIndex: 'rel',
      key: 'rel',
      render: (rel: string | undefined, row) => {
        const relPath = rel?.trim();
        const summary = formatOutlineVoiceBindingSummary(
          binding,
          row.target,
          config?.models ?? [],
        );
        const display = summary || relPath;
        if (!display) return <Text type="secondary">未选择</Text>;
        return (
          <Flex align="center" gap={4} style={{ minWidth: 0, maxWidth: 360 }}>
            {relPath ?
              <Button
                type="text"
                size="small"
                style={{ flexShrink: 0 }}
                icon={isPlaying(relPath) ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                aria-label={isPlaying(relPath) ? '停止试听' : '试听'}
                onClick={() => void toggleVoicePreview(relPath)}
              />
            : null}
            <Text ellipsis style={{ flex: 1, minWidth: 0 }} title={display}>
              {display}
            </Text>
          </Flex>
        );
      },
    },
    {
      title: '操作',
      key: 'op',
      width: 280,
      render: (_, r) => (
        <Space size={4} wrap>
          <Button type="link" size="small" icon={<i className='iconfont'>&#xe85c;</i>} onClick={() => setVoiceDesign(r.target)}>
            音色设计
          </Button>
          <Button type="link" size="small" icon={<RocketOutlined />} onClick={() => setVoiceEnrollment(r.target)}>
            音色复制
          </Button>
          <Button type="link" size="small" icon={<i className='iconfont'>&#xe670;</i>} onClick={() => setLookup(r.target)}>
            选择
          </Button>
        </Space>
      ),
    },
  ];

  const modalTitle =
    lookup?.kind === 'narrator' ? '选择旁白音色样本' : lookup ? `选择角色「${lookup.label}」音色样本` : '';

  return (
    <Flex vertical style={{ flex: 1, minHeight: 0, padding: 16, overflow: 'auto' }}>
      <Paragraph style={{ marginBottom: 12 }}>
        <Text strong>大纲音色样本</Text>
        <div style={{ marginTop: 6 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            此处绑定的 wav 将同时用于本地 LongCat 克隆与云端 MiMo V2.5 音色克隆（voiceclone）；建议在「正文集」前先完成旁白与各角色绑定。LongCat 需在样本同目录自备与 wav 同名的 UTF-8 文稿（
            <Text code>.txt</Text>）。
          </Text>
        </div>
        {onFillMainCharactersFromOutlineAi && onAddCharacterToVoiceListAi ?
          <Space wrap style={{ marginTop: 10 }}>
            <Button
              size="small"
              type="primary"
              icon={<ThunderboltOutlined />}
              loading={outlineVoiceAiPending}
              onClick={() => onFillMainCharactersFromOutlineAi()}
            >
              根据故事大纲自动补齐主要角色音色列表
            </Button>
            <Button
              size="small"
              icon={<UserAddOutlined />}
              loading={outlineVoiceAiPending}
              onClick={() => onAddCharacterToVoiceListAi()}
            >
              增加角色到音色列表
            </Button>
          </Space>
        : null}
      </Paragraph>
      {!hasVoiceDirs ?
        <Empty
          description={
            <span>
              未配置音色样本目录。
              <Button type="link" onClick={() => openConfigModal()}>
                打开设置
              </Button>
              。内置 <Text code>PresetVoice/</Text> 会自动加载；也可在「有声书」页签配置外置或自定义目录。
            </span>
          }
        />
      : <>
          <Table size="small" pagination={false} columns={columns} dataSource={rows} />
          {characters.length === 0 ?
            <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
              当前无剧本角色，仅可设置旁白。
            </Text>
          : null}
        </>
      }

      <VoiceSampleLookupModal
        open={lookup != null}
        presetScanRootDirs={presetScanRoots}
        customRootDir={voiceRoots.custom}
        title={modalTitle}
        onCancel={() => setLookup(null)}
        onSelect={({ relativePath }) => {
          const target = lookup;
          setLookup(null);
          if (!target) return;
          const { cloudEngineId, cloudVoiceId } = resolveEmbeddedMinimaxBinding(relativePath);
          setWorkspace((w) => {
            if (!w) return w;
            if (target.kind === 'narrator') {
              return updateAudiobookOutlineVoiceSamples(w, {
                narratorRelPath: relativePath,
                narratorRefText: '',
                narratorCloudEngineId: cloudEngineId,
                narratorCloudVoiceId: cloudVoiceId,
              });
            }
            return updateAudiobookOutlineVoiceSamples(w, {
              byCharacterId: { [target.characterId]: relativePath },
              byCharacterRefText: { [target.characterId]: '' },
              byCharacterCloudEngineId: { [target.characterId]: cloudEngineId },
              byCharacterCloudVoiceId: { [target.characterId]: cloudVoiceId },
            });
          });
        }}
      />

      <VoiceDesignGenerateModal
        open={voiceDesign != null}
        customVoiceSamplesRootDir={voiceRoots.custom}
        models={config?.models ?? []}
        target={voiceDesign}
        setWorkspace={setWorkspace}
        onCancel={() => setVoiceDesign(null)}
      />

      <VoiceEnrollmentModal
        open={voiceEnrollment != null}
        customVoiceSamplesRootDir={voiceRoots.custom}
        models={config?.models ?? []}
        target={voiceEnrollment}
        setWorkspace={setWorkspace}
        onCancel={() => setVoiceEnrollment(null)}
      />
    </Flex>
  );
}
