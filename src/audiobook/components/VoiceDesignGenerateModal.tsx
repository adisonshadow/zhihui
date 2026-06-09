/**
 * 大纲音色行「音色设计」：MiMo / Qwen —— 试听后可绑定当前行或保存
 */
import type { Dispatch, SetStateAction } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  App,
  Button,
  Flex,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
} from 'antd';
import { ExperimentOutlined } from '@ant-design/icons';

import type { AIModelConfig } from '@/types/settings';
import type { NovelWorkspaceSnapshot } from '@/novelDesign/storage/novelWorkspaceStorage';
import { updateAudiobookOutlineVoiceSamples } from '@/novelDesign/storage/novelWorkspaceStorage';
import {
  MIMO_VOICE_DESIGN_PRESETS,
  MIMO_VOICE_DESIGN_PREVIEW_SNIPPETS,
} from '@/novelDesign/constants/mimoVoiceDesignPresets';
import { buildVoiceDesignSelectOptions } from '@/audiobook/utils/audiobookTtsModelOptions';
import { findVoiceDesignEngines } from '@/novelDesign/utils/mimoVoiceDesignSynthesize';
import {
  synthesizeVoiceDesignPreview,
  voiceDesignLimitsForEngine,
} from '@/novelDesign/utils/voiceDesignSynthesize';
import {
  isDashscopeVoiceDesignEngine,
  isMimoVoiceDesignEngine,
  isMinimaxVoiceDesignEngine,
} from '@/components/tts/voiceCapabilityInference';
import { optimizeMimoVoiceDescription } from '@/novelDesign/utils/optimizeMimoVoiceDescription';
import { saveVoiceSampleWav } from '@/audiobook/utils/audiobookVoiceSampleFiles';
import { appendSavedVoiceSample, newSavedVoiceSamplePartial } from '@/audiobook/utils/audiobookSavedVoiceSamples';
import { getAISettings, saveAISettings } from '@/utils/settingsStorage';
import { useConfigContext } from '@/contexts/ConfigContext';

const { Text, Paragraph } = Typography;

export type VoiceDesignBindTarget =
  | { kind: 'narrator' }
  | { kind: 'character'; characterId: string; label: string };

export interface VoiceDesignGenerateModalProps {
  open: boolean;
  customVoiceSamplesRootDir: string;
  models: AIModelConfig[];
  target: VoiceDesignBindTarget | null;
  /** 大纲「风格指令」，打开时预填音色描述 */
  defaultStyleInstruction?: string;
  setWorkspace: Dispatch<SetStateAction<NovelWorkspaceSnapshot | null>>;
  onCancel: () => void;
}

export function VoiceDesignGenerateModal({
  open,
  customVoiceSamplesRootDir,
  models,
  target,
  defaultStyleInstruction,
  setWorkspace,
  onCancel,
}: VoiceDesignGenerateModalProps) {
  const { message } = App.useApp();
  const { refreshConfig, onConfigSaved } = useConfigContext();

  const [voiceDesc, setVoiceDesc] = useState('');
  const [voicePrefix, setVoicePrefix] = useState('yiman');
  const [previewText, setPreviewText] = useState(MIMO_VOICE_DESIGN_PREVIEW_SNIPPETS[0]?.text ?? '');
  const [snippetKey, setSnippetKey] = useState<string | undefined>(
    MIMO_VOICE_DESIGN_PREVIEW_SNIPPETS[0]?.key,
  );

  const [optimizing, setOptimizing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [lastAudioUrl, setLastAudioUrl] = useState<string | null>(null);
  const [lastCloudVoiceId, setLastCloudVoiceId] = useState('');
  const lastBufferRef = useRef<ArrayBuffer | null>(null);

  const [saveNameOpen, setSaveNameOpen] = useState(false);
  const [saveNameBusy, setSaveNameBusy] = useState(false);
  const [formSave] = Form.useForm<{ sampleName?: string }>();

  const revokeRef = useRef<string | null>(null);

  const designEngines = useMemo(() => findVoiceDesignEngines(models), [models]);
  const designEngineOptions = useMemo(() => buildVoiceDesignSelectOptions(models), [models]);
  const [engineId, setEngineId] = useState('');
  const engine = useMemo(
    () => designEngines.find((e) => e.engineId === engineId) ?? designEngines[0],
    [designEngines, engineId],
  );
  const isMimoDesign = engine ? isMimoVoiceDesignEngine(engine) : false;
  const isDashscopeDesign = engine ? isDashscopeVoiceDesignEngine(engine) : false;
  const isMinimaxDesign = engine ? isMinimaxVoiceDesignEngine(engine) : false;
  // const isCosyDesign = false; // CosyVoice 已停用
  const limits = useMemo(() => (engine ? voiceDesignLimitsForEngine(engine) : null), [engine]);

  useEffect(() => {
    if (!open) return;
    setEngineId(designEngines[0]?.engineId ?? '');
    setVoiceDesc(defaultStyleInstruction?.trim() ?? '');
    setVoicePrefix('yiman');
    setSnippetKey(MIMO_VOICE_DESIGN_PREVIEW_SNIPPETS[0]?.key);
    setPreviewText(MIMO_VOICE_DESIGN_PREVIEW_SNIPPETS[0]?.text ?? '');
    setOptimizing(false);
    setGenerating(false);
    setLastCloudVoiceId('');
    lastBufferRef.current = null;
    if (revokeRef.current) {
      URL.revokeObjectURL(revokeRef.current);
      revokeRef.current = null;
    }
    setLastAudioUrl(null);
    setSaveNameOpen(false);
  }, [open, defaultStyleInstruction]);

  useEffect(() => {
    if (!open || !designEngines.length) return;
    if (!designEngines.some((e) => e.engineId === engineId)) {
      setEngineId(designEngines[0]!.engineId);
    }
  }, [open, designEngines, engineId]);

  const previewSnippetLabel = useMemo(() => {
    const s = MIMO_VOICE_DESIGN_PREVIEW_SNIPPETS.find((x) => x.key === snippetKey);
    return s?.label;
  }, [snippetKey]);

  const previewLong = limits ? previewText.trim().length > limits.previewTextMax : false;

  const releaseAudioUrl = () => {
    if (revokeRef.current) {
      URL.revokeObjectURL(revokeRef.current);
      revokeRef.current = null;
    }
    setLastAudioUrl(null);
  };

  const onOptimize = async () => {
    const d = voiceDesc.trim();
    if (!d) return;
    setOptimizing(true);
    try {
      const res = await optimizeMimoVoiceDescription(d);
      if (!res.ok) {
        message.error(res.error.slice(0, 200));
        return;
      }
      setVoiceDesc(res.text);
      message.success('已优化音色描述');
    } finally {
      setOptimizing(false);
    }
  };

  const onGenerate = async () => {
    const root = customVoiceSamplesRootDir.trim();
    if (!root) {
      message.warning('请先在设置 → 有声书中配置「自定义音色样本目录」');
      return;
    }
    if (!engine) {
      message.error('未配置可用的音色设计模型');
      return;
    }
    if (isMinimaxDesign && !(engine.modelConfig?.minimaxGroupId ?? '').trim()) {
      message.error('MiniMax 音色设计需在设置 → AI 模型 → MiniMax Speech 填写 GroupId');
      return;
    }

    let textOut = previewText.trim();
    const previewMax = limits?.previewTextMax ?? 100;
    if (textOut.length > previewMax) {
      message.warning(`试听文本已截断为 ${previewMax} 字`);
      textOut = textOut.slice(0, previewMax);
      setPreviewText(textOut);
    }

    setGenerating(true);
    releaseAudioUrl();
    lastBufferRef.current = null;
    setLastCloudVoiceId('');
    try {
      const synth = await synthesizeVoiceDesignPreview({
        engine,
        voiceDescription: voiceDesc,
        previewText: textOut,
        previewSceneLabel: isMimoDesign ? previewSnippetLabel : undefined,
        preferredName: isDashscopeDesign ? voicePrefix : undefined,
        voicePrefix: isMinimaxDesign ? voicePrefix : undefined,
      });
      if (!synth.ok) {
        message.error(synth.error.slice(0, 480));
        return;
      }
      lastBufferRef.current = synth.arrayBuffer;
      if (synth.cloudVoiceId) setLastCloudVoiceId(synth.cloudVoiceId);
      const blob = new Blob([synth.arrayBuffer], { type: synth.ext === '.wav' ? 'audio/wav' : 'audio/mpeg' });
      const url = URL.createObjectURL(blob);
      revokeRef.current = url;
      setLastAudioUrl(url);
      message.success('生成成功，可试听');
    } finally {
      setGenerating(false);
    }
  };

  const bindCurrentRow = (relativePath: string, cloudVoiceId?: string) => {
    const t = target;
    if (!t) return;
    const cloudId = cloudVoiceId?.trim();
    const engineIdForCloud = engine?.engineId;
    setWorkspace((w) => {
      if (!w) return w;
      if (t.kind === 'narrator') {
        return updateAudiobookOutlineVoiceSamples(w, {
          narratorRelPath: relativePath,
          narratorRefText: voiceDesc.trim() || '',
          narratorCloudEngineId: cloudId && engineIdForCloud ? engineIdForCloud : '',
          narratorCloudVoiceId: cloudId || '',
        });
      }
      return updateAudiobookOutlineVoiceSamples(w, {
        byCharacterId: { [t.characterId]: relativePath },
        byCharacterRefText: { [t.characterId]: voiceDesc.trim() || '' },
        byCharacterCloudEngineId:
          cloudId && engineIdForCloud ? { [t.characterId]: engineIdForCloud } : { [t.characterId]: '' },
        byCharacterCloudVoiceId: cloudId ? { [t.characterId]: cloudId } : { [t.characterId]: '' },
      });
    });
  };

  const persistAndNotify = async (nextSettings: Parameters<typeof saveAISettings>[0]) => {
    const sav = await saveAISettings(nextSettings);
    if (!sav.ok) {
      message.error(sav.error ?? '保存设置失败');
      return false;
    }
    await refreshConfig();
    const reload = await getAISettings();
    if (reload) onConfigSaved(reload);
    return true;
  };

  const closeAll = () => {
    releaseAudioUrl();
    lastBufferRef.current = null;
    onCancel();
  };

  const onUseVoice = async () => {
    const buf = lastBufferRef.current;
    const root = customVoiceSamplesRootDir.trim();
    if (!buf || !root) {
      message.warning('请先生成可试听的音色');
      return;
    }
    const base = `voicedesign-${Date.now().toString(36)}`;
    const res = await saveVoiceSampleWav({
      voiceSamplesRootDir: root,
      desiredBaseName: base,
      baseNameStem: base,
      wavArrayBuffer: buf,
      voiceDescription: voiceDesc.trim(),
    });
    if (!res.ok) {
      message.error(res.error);
      return;
    }
    bindCurrentRow(res.relativePath, lastCloudVoiceId || undefined);
    message.success(
      lastCloudVoiceId.trim() ? '已绑定当前行（wav + 云端 voice）' : '已绑定当前行样本',
    );
    closeAll();
  };

  const submitSaveFavorite = async () => {
    const buf = lastBufferRef.current;
    const root = customVoiceSamplesRootDir.trim();
    if (!buf || !root) {
      message.warning('请先生成可试听的音色');
      return;
    }
    try {
      const v = await formSave.validateFields();
      const stem = (v.sampleName ?? '').trim();
      if (!stem) {
        message.warning('请输入名称');
        return;
      }

      const full = await getAISettings();
      if (!full) {
        message.error('无法读取设置');
        return;
      }

      setSaveNameBusy(true);
      const saved = await saveVoiceSampleWav({
        voiceSamplesRootDir: root,
        desiredBaseName: stem,
        wavArrayBuffer: buf,
        voiceDescription: voiceDesc.trim(),
      });
      if (!saved.ok) {
        message.error(saved.error);
        return;
      }

      const part = newSavedVoiceSamplePartial(stem);
      const entry = {
        ...part,
        name: stem,
        relativePath: saved.relativePath,
        voiceDescription: voiceDesc.trim() || undefined,
      };
      const next = appendSavedVoiceSample(full, entry);
      const ok = await persistAndNotify(next);
      if (!ok) return;
      message.success('已保存到音色设计库');
      setSaveNameOpen(false);
    } catch {
      /** validateFields */
    } finally {
      setSaveNameBusy(false);
    }
  };

  const titleRow =
    target?.kind === 'narrator' ? '音色设计（旁白）' :
    target ? `音色设计（角色：${target.label}）`
    : '音色设计';

  return (
    <>
      <Modal
        title={titleRow}
        open={open}
        onCancel={closeAll}
        footer={null}
        width={640}
        destroyOnHidden
        styles={{ body: { paddingTop: 8 } }}
      >
        {!customVoiceSamplesRootDir.trim() ?
          <Paragraph type="secondary">请先在设置中配置「自定义音色样本目录」。</Paragraph>
        : !engine ?
          <Paragraph type="danger">
            未检测到可用的音色设计模型。请在设置中添加：MiMo V2.5 音色设计、Qwen3-TTS 声音设计（qwen3-tts-vd-*），或 MiniMax Speech（voice_design API）。
          </Paragraph>
        : (
          <Flex vertical gap={14}>
            {designEngines.length > 0 ?
              <div>
                <Text strong style={{ display: 'block', marginBottom: 6 }}>
                  设计模型
                </Text>
                <Select
                  style={{ width: '100%' }}
                  value={engine?.engineId}
                  options={designEngineOptions}
                  onChange={setEngineId}
                />
              </div>
            : null}
            <div>
              <Flex justify="space-between" align="center" wrap="wrap" gap={8} style={{ marginBottom: 6 }}>
                <Text strong>音色描述</Text>
                <Button
                  type="text"
                  icon={<ExperimentOutlined />}
                  loading={optimizing}
                  disabled={!voiceDesc.trim()}
                  onClick={() => void onOptimize()}
                >
                  AI 优化音色描述
                </Button>
              </Flex>
              <Input.TextArea
                rows={4}
                value={voiceDesc}
                onChange={(e) => setVoiceDesc(e.target.value)}
                placeholder="用一两句话白描音色：年龄段、音质、语速节奏、情绪底色……"
                maxLength={limits?.voicePromptMax}
                showCount={!!limits}
              />
              <Space wrap size={[6, 6]} style={{ marginTop: 8 }}>
                {MIMO_VOICE_DESIGN_PRESETS.map((p) => (
                  <Tag
                    key={p.key}
                    style={{ cursor: 'pointer', marginInlineEnd: 0 }}
                    onClick={() => setVoiceDesc(p.description)}
                  >
                    {p.label}
                  </Tag>
                ))}
              </Space>
            </div>

            {isDashscopeDesign ?
              <Space wrap align="center">
                <Text type="secondary">preferred_name</Text>
                <Input
                  style={{ width: 140 }}
                  value={voicePrefix}
                  onChange={(e) => setVoicePrefix(e.target.value || 'yiman')}
                  maxLength={16}
                />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  DashScope 声音设计 API 命名前缀
                </Text>
              </Space>
            : null}

            {isMinimaxDesign ?
              <Space wrap align="center">
                <Text type="secondary">voice_id（可选）</Text>
                <Input
                  style={{ width: 220 }}
                  value={voicePrefix}
                  onChange={(e) => setVoicePrefix(e.target.value)}
                  placeholder="留空则由 MiniMax 自动生成"
                  allowClear
                />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  绑定后片段合成须选用同一 MiniMax Speech 实例
                </Text>
              </Space>
            : null}

            <div>
              <Flex justify="space-between" align="center" wrap="wrap" gap={8} style={{ marginBottom: 6 }}>
                <Text strong>试听文本</Text>
                <Select
                  allowClear={false}
                  style={{ minWidth: 200 }}
                  value={snippetKey}
                  options={MIMO_VOICE_DESIGN_PREVIEW_SNIPPETS.map((s) => ({ value: s.key, label: s.label }))}
                  onChange={(k) => {
                    setSnippetKey(k);
                    const sn = MIMO_VOICE_DESIGN_PREVIEW_SNIPPETS.find((x) => x.key === k);
                    if (sn) setPreviewText(sn.text);
                  }}
                />
              </Flex>
              <Input.TextArea
                rows={4}
                value={previewText}
                onChange={(e) => setPreviewText(e.target.value)}
                maxLength={limits?.previewTextMax}
                showCount={!!limits}
              />
              {previewLong ?
                <Text type="warning" style={{ display: 'block', marginTop: 4, fontSize: 12 }}>
                  超过 {limits?.previewTextMax ?? 100} 字，生成时将自动截断
                </Text>
              : null}
            </div>

            {lastCloudVoiceId ?
              <Text type="secondary" style={{ fontSize: 12 }}>
                已设计 voice：<Text code>{lastCloudVoiceId}</Text>
              </Text>
            : null}

            <Flex gap={10} wrap="wrap" align="center">
              <Button type="primary" loading={generating} onClick={() => void onGenerate()}>
                生成音色
              </Button>
            </Flex>

            {generating ?
              <Spin
                tip={
                  isMinimaxDesign ? '正在请求 MiniMax 音色设计…'
                  : isDashscopeDesign ? '正在请求 DashScope 声音设计…'
                  : '正在请求 MiMo VoiceDesign…'
                }
              >
                <div style={{ minHeight: 48 }} />
              </Spin>
            : lastAudioUrl ?
              <>
                <audio controls src={lastAudioUrl} style={{ width: '100%', maxHeight: 48 }} />
                <Flex gap={8} wrap="wrap">
                  <Button type="primary" onClick={() => void onUseVoice()}>
                    使用该音色
                  </Button>
                  <Button onClick={() => setSaveNameOpen(true)}>保存到音色设计库</Button>
                </Flex>
              </>
            : null}
          </Flex>
        )}
      </Modal>

      <Modal
        title="命名并保存到音色设计库"
        open={saveNameOpen}
        onCancel={() => setSaveNameOpen(false)}
        destroyOnHidden
        okButtonProps={{ loading: saveNameBusy }}
        onOk={() => void submitSaveFavorite()}
      >
        <Form form={formSave} layout="vertical">
          <Form.Item
            name="sampleName"
            label="音色名称"
            rules={[{ required: true, message: '请输入名称' }]}
          >
            <Input placeholder="将写入 .yiman-voices 目录" autoComplete="off" />
          </Form.Item>
          <Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 0 }}>
            将保存 wav 及同名 txt（文稿为音色描述，供 LongCat 侧读取）。
          </Paragraph>
        </Form>
      </Modal>
    </>
  );
}
