/**
 * 音色复制：云端 enrollment（voice_id）+ MiMo voiceclone（样本 wav 内联克隆）
 */
import type { Dispatch, SetStateAction } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { App, Button, Flex, Form, Input, Modal, Select, Space, Spin, Typography } from 'antd';

import type { AIModelConfig } from '@/types/settings';
import type { NovelWorkspaceSnapshot } from '@/novelDesign/storage/novelWorkspaceStorage';
import { updateAudiobookOutlineVoiceSamples } from '@/novelDesign/storage/novelWorkspaceStorage';
import { buildVoiceEnrollmentSelectOptions } from '@/audiobook/utils/audiobookTtsModelOptions';
import {
  findVoiceEnrollmentEngines,
  isMimoVoiceCloneEngine,
} from '@/components/tts/voiceCapabilityInference';
import { ensureRemoteVoiceIdForTts } from '@/components/tts/ensureRemoteVoiceId';
import { parseEmbeddedPresetVoiceIdFromPath } from '@/audiobook/utils/embeddedPresetVoiceId';
import { fetchRemoteTtsAudio } from '@/components/tts/ttsModelAdapters';
import {
  saveVoiceSampleFromAbsolutePath,
  saveVoiceSampleWav,
} from '@/audiobook/utils/audiobookVoiceSampleFiles';
import { appendSavedVoiceSample, newSavedVoiceSamplePartial } from '@/audiobook/utils/audiobookSavedVoiceSamples';
import { MIMO_VOICE_DESIGN_PREVIEW_SNIPPETS } from '@/novelDesign/constants/mimoVoiceDesignPresets';
import { resolveRequestModelId } from '@/utils/aiModelRequestId';
import { getAISettings, saveAISettings } from '@/utils/settingsStorage';
import { useConfigContext } from '@/contexts/ConfigContext';

const { Text, Paragraph } = Typography;

export type VoiceEnrollmentBindTarget =
  | { kind: 'narrator' }
  | { kind: 'character'; characterId: string; label: string };

export interface VoiceEnrollmentModalProps {
  open: boolean;
  customVoiceSamplesRootDir: string;
  models: AIModelConfig[];
  target: VoiceEnrollmentBindTarget | null;
  setWorkspace: Dispatch<SetStateAction<NovelWorkspaceSnapshot | null>>;
  onCancel: () => void;
}

export function VoiceEnrollmentModal({
  open,
  customVoiceSamplesRootDir,
  models,
  target,
  setWorkspace,
  onCancel,
}: VoiceEnrollmentModalProps) {
  const { message } = App.useApp();
  const { refreshConfig, onConfigSaved } = useConfigContext();

  const engineOptions = useMemo(() => buildVoiceEnrollmentSelectOptions({ models }), [models]);
  const enrollmentEngines = useMemo(() => findVoiceEnrollmentEngines(models), [models]);

  const [engineId, setEngineId] = useState('');
  const engine = useMemo(
    () => enrollmentEngines.find((e) => e.engineId === engineId) ?? enrollmentEngines[0],
    [enrollmentEngines, engineId],
  );

  const [audioPath, setAudioPath] = useState('');
  const [publicUrl, setPublicUrl] = useState('');
  const [referenceText, setReferenceText] = useState('');
  const [voicePrefix, setVoicePrefix] = useState('yiman');
  const [previewText, setPreviewText] = useState(MIMO_VOICE_DESIGN_PREVIEW_SNIPPETS[0]?.text ?? '');

  const [busy, setBusy] = useState(false);
  const [usingVoice, setUsingVoice] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [lastVoiceId, setLastVoiceId] = useState('');
  const lastBufferRef = useRef<ArrayBuffer | null>(null);
  const revokeRef = useRef<string | null>(null);

  const [saveNameOpen, setSaveNameOpen] = useState(false);
  const [saveNameBusy, setSaveNameBusy] = useState(false);
  const [formSave] = Form.useForm<{ sampleName?: string }>();

  const isCosy = false; // CosyVoice 已停用：engine?.adapterKind === 'cosyvoice_dashscope_ws';
  const isMimoClone = engine ? isMimoVoiceCloneEngine(engine) : false;
  const isMinimaxClone = engine?.adapterKind === 'minimax_t2a_v2';

  useEffect(() => {
    if (!open) return;
    setEngineId(enrollmentEngines[0]?.engineId ?? '');
    setAudioPath('');
    setPublicUrl('');
    setReferenceText('');
    setVoicePrefix('yiman');
    setPreviewText(MIMO_VOICE_DESIGN_PREVIEW_SNIPPETS[0]?.text ?? '');
    setLastVoiceId('');
    lastBufferRef.current = null;
    if (revokeRef.current) {
      URL.revokeObjectURL(revokeRef.current);
      revokeRef.current = null;
    }
    setPreviewUrl(null);
    setSaveNameOpen(false);
    setUsingVoice(false);
  }, [open]);

  useEffect(() => {
    if (!open || !enrollmentEngines.length) return;
    if (!enrollmentEngines.some((e) => e.engineId === engineId)) {
      setEngineId(enrollmentEngines[0]!.engineId);
    }
  }, [open, enrollmentEngines, engineId]);

  const releasePreview = () => {
    if (revokeRef.current) {
      URL.revokeObjectURL(revokeRef.current);
      revokeRef.current = null;
    }
    setPreviewUrl(null);
    lastBufferRef.current = null;
  };

  const closeAll = () => {
    releasePreview();
    onCancel();
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

  const readCloneDataUrl = async (): Promise<string | null> => {
    const p = audioPath.trim();
    if (!p) {
      message.error('请选择参考音频文件');
      return null;
    }
    const read = window.yiman?.fs?.readFileAsDataUrl;
    if (!read) {
      message.error('无法读取本地音频');
      return null;
    }
    const dataUrl = await read(p);
    if (!dataUrl?.trim()) {
      message.error('读取参考音频失败');
      return null;
    }
    return dataUrl.trim();
  };

  const buildTtsParams = (): Record<string, unknown> => {
    if (isCosy && publicUrl.trim()) {
      return {
        ttsVoiceSource: 'clone_from_url',
        ttsClonePublicUrl: publicUrl.trim(),
        ttsVoicePrefix: voicePrefix.trim() || 'yiman',
      };
    }
    return {
      ttsVoiceSource: 'clone_from_file',
      ttsCloneAudioPath: audioPath.trim(),
      ttsReferenceText: referenceText.trim(),
      ttsVoicePrefix: voicePrefix.trim() || 'yiman',
    };
  };

  const pickAudio = async () => {
    const dlg = window.yiman?.dialog?.openFile;
    if (!dlg) return;
    const p = await dlg({ filters: [{ name: '音频', extensions: ['wav', 'mp3', 'm4a'] }] });
    if (p) setAudioPath(p);
  };

  const enrollVoiceId = async (): Promise<string | null> => {
    if (!engine?.modelConfig) {
      message.error('未选择复刻模型');
      return null;
    }
    if (isCosy && !publicUrl.trim() && !audioPath.trim()) {
      message.error('CosyVoice 复刻需公网 URL，或先选择本地文件后上传至对象存储再粘贴 URL');
      return null;
    }
    if (!isCosy && !audioPath.trim()) {
      message.error('请选择参考音频文件');
      return null;
    }
    if (engine.adapterKind === 'minimax_t2a_v2' && !(engine.modelConfig.minimaxGroupId ?? '').trim()) {
      message.error('MiniMax 复刻需在设置 → AI 模型 → MiniMax Speech 填写 GroupId');
      return null;
    }

    if (isMinimaxClone && audioPath.trim()) {
      const embedded = parseEmbeddedPresetVoiceIdFromPath(audioPath.trim());
      if (embedded?.provider === 'minimax') {
        setLastVoiceId(embedded.voiceId);
        message.info(`预制样本已含 MiniMax voice_id，将跳过上传复刻：${embedded.voiceId}`);
        return embedded.voiceId;
      }
    }

    const ensured = await ensureRemoteVoiceIdForTts({
      adapterKind: engine.adapterKind,
      model: engine.modelConfig,
      ttsParams: buildTtsParams(),
      previewText: previewText.slice(0, 120),
    });
    if (!ensured.ok) {
      message.error(ensured.error);
      return null;
    }
    setLastVoiceId(ensured.voiceId);
    return ensured.voiceId;
  };

  const onPreview = async () => {
    if (!engine) return;
    const text = previewText.trim();
    if (!text) {
      message.warning('请填写试听文本');
      return;
    }
    setBusy(true);
    releasePreview();
    lastBufferRef.current = null;
    try {
      if (isMimoClone) {
        const dataUrl = await readCloneDataUrl();
        if (!dataUrl) return;
        const slug =
          (engine.modelConfig ? resolveRequestModelId(engine.modelConfig) : undefined) ??
          'mimo-v2.5-tts-voiceclone';
        const synth = await fetchRemoteTtsAudio(engine, text, {
          format: 'wav',
          mimoEffectiveModelId: slug,
          mimoVoiceCloneDataUrl: dataUrl,
          mimoPreformattedAssistant: true,
        });
        if (!synth.ok) {
          message.error(synth.error.slice(0, 220));
          return;
        }
        lastBufferRef.current = synth.arrayBuffer;
        const blob = new Blob([synth.arrayBuffer], {
          type: synth.ext === '.wav' ? 'audio/wav' : 'audio/mpeg',
        });
        const url = URL.createObjectURL(blob);
        revokeRef.current = url;
        setPreviewUrl(url);
        return;
      }

      const voiceId = lastVoiceId || (await enrollVoiceId());
      if (!voiceId) return;
      const synth = await fetchRemoteTtsAudio(engine, text, {
        ...buildTtsParams(),
        ttsVoiceSource: 'cloned_id',
        ttsClonedVoiceId: voiceId,
        voice: voiceId,
      });
      if (!synth.ok) {
        message.error(synth.error.slice(0, 220));
        return;
      }
      lastBufferRef.current = synth.arrayBuffer;
      const blob = new Blob([synth.arrayBuffer], {
        type: synth.ext === '.wav' ? 'audio/wav' : 'audio/mpeg',
      });
      const url = URL.createObjectURL(blob);
      revokeRef.current = url;
      setPreviewUrl(url);
    } finally {
      setBusy(false);
    }
  };

  const bindRow = (relativePath: string, cloudVoiceId?: string) => {
    const t = target;
    if (!t || !engine?.modelConfig) return;
    const cloudId = cloudVoiceId?.trim();
    const engineIdForCloud = engine.engineId;
    setWorkspace((w) => {
      if (!w) return w;
      if (t.kind === 'narrator') {
        return updateAudiobookOutlineVoiceSamples(w, {
          narratorRelPath: relativePath,
          narratorRefText: referenceText.trim() || '',
          narratorCloudEngineId: cloudId && engineIdForCloud ? engineIdForCloud : '',
          narratorCloudVoiceId: cloudId || '',
        });
      }
      return updateAudiobookOutlineVoiceSamples(w, {
        byCharacterId: { [t.characterId]: relativePath },
        byCharacterRefText: { [t.characterId]: referenceText.trim() || '' },
        byCharacterCloudEngineId:
          cloudId && engineIdForCloud ? { [t.characterId]: engineIdForCloud } : { [t.characterId]: '' },
        byCharacterCloudVoiceId: cloudId ? { [t.characterId]: cloudId } : { [t.characterId]: '' },
      });
    });
  };

  const bindMimoCloneRow = async (): Promise<boolean> => {
    const root = customVoiceSamplesRootDir.trim();
    const t = target;
    if (!t || !root || !audioPath.trim()) {
      message.error('请选择参考音频文件');
      return false;
    }

    const base = `mimo-clone-${Date.now().toString(36)}`;
    const saved = await saveVoiceSampleFromAbsolutePath({
      voiceSamplesRootDir: root,
      sourceAbsolutePath: audioPath.trim(),
      desiredBaseName: base,
      sidecarText: referenceText.trim() || undefined,
    });
    if (!saved.ok) {
      message.error(saved.error);
      return false;
    }

    bindRow(saved.relativePath);
    return true;
  };

  const onUseVoice = async () => {
    const root = customVoiceSamplesRootDir.trim();
    if (!root || !target) return;

    setUsingVoice(true);
    try {
      if (isMimoClone) {
        const ok = await bindMimoCloneRow();
        if (!ok) return;
        message.success('已绑定 MiMo 音色复制样本（合成时将内联参考音频）');
        closeAll();
        return;
      }

      const buf = lastBufferRef.current;
      if (!buf) {
        message.warning('请先复刻并试听');
        return;
      }
      const voiceId = lastVoiceId || (await enrollVoiceId());
      if (!voiceId) return;

      const base = `enroll-${Date.now().toString(36)}`;
      const res = await saveVoiceSampleWav({
        voiceSamplesRootDir: root,
        desiredBaseName: base,
        baseNameStem: base,
        wavArrayBuffer: buf,
        voiceDescription: referenceText.trim() || '音色复制',
      });
      if (!res.ok) {
        message.error(res.error);
        return;
      }
      bindRow(res.relativePath, voiceId);
      message.success('已绑定当前行（wav + 云端 voice）');
      closeAll();
    } finally {
      setUsingVoice(false);
    }
  };

  const submitSaveFavorite = async () => {
    const buf = lastBufferRef.current;
    const root = customVoiceSamplesRootDir.trim();
    if (!buf || !root) {
      message.warning('请先复刻并试听');
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
        voiceDescription: referenceText.trim() || '音色复制',
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
        voiceDescription: referenceText.trim() || undefined,
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
    target?.kind === 'narrator' ? '音色复制（旁白）' :
    target ? `音色复制（角色：${target.label}）`
    : '音色复制';

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
      : enrollmentEngines.length === 0 ?
        <Paragraph type="danger">
          未检测到可用的音色复制模型。请在设置中添加：MiMo V2.5 音色克隆（mimo-v2.5-tts-voiceclone），或带「音色复制」能力的
          Qwen-TTS / MiniMax Speech（files/upload + voice_clone API）。
        </Paragraph>
      : (
        <Flex vertical gap={12}>
          <div>
            <Text strong style={{ display: 'block', marginBottom: 6 }}>
              复刻模型
            </Text>
            <Select
              style={{ width: '100%' }}
              value={engine?.engineId}
              options={engineOptions}
              onChange={setEngineId}
            />
          </div>

          {isCosy ?
            <div>
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                公网 URL（CosyVoice 必填；本地文件需先上传至对象存储）
              </Text>
              <Input
                placeholder="https://…"
                value={publicUrl}
                onChange={(e) => setPublicUrl(e.target.value)}
                allowClear
              />
            </div>
          : null}

          <Space wrap align="center">
            <Text type="secondary">参考音频</Text>
            <Input style={{ minWidth: 220 }} readOnly value={audioPath} placeholder="wav / mp3" />
            <Button onClick={() => void pickAudio()}>选择文件</Button>
          </Space>

          {isMimoClone ?
            <>
              <Text type="secondary" style={{ fontSize: 12 }}>
                MiMo 音色复制：上传样本后绑定至大纲，有声书合成时内联参考音频（无云端 voice_id）。
              </Text>
              <Space wrap align="center" style={{ width: '100%' }}>
                <Text type="secondary">参考文稿</Text>
                <Input
                  style={{ flex: 1, minWidth: 160 }}
                  placeholder="可选，保存为 sidecar"
                  value={referenceText}
                  onChange={(e) => setReferenceText(e.target.value)}
                  allowClear
                />
              </Space>
            </>
          : isMinimaxClone ?
            <>
              <Text type="secondary" style={{ fontSize: 12 }}>
                MiniMax 音色复制：先上传样本（files/upload），再调用 voice_clone 生成 voice_id；绑定后片段合成须选用同一 MiniMax Speech 实例。
              </Text>
              <Space wrap align="center" style={{ width: '100%' }}>
                <Text type="secondary">voice_id 前缀</Text>
                <Input
                  style={{ width: 100 }}
                  value={voicePrefix}
                  onChange={(e) => setVoicePrefix(e.target.value || 'zhihui')}
                />
                <Text type="secondary">参考文稿</Text>
                <Input
                  style={{ flex: 1, minWidth: 160 }}
                  placeholder="可选"
                  value={referenceText}
                  onChange={(e) => setReferenceText(e.target.value)}
                  allowClear
                />
              </Space>
            </>
          : (
            <Space wrap align="center" style={{ width: '100%' }}>
              <Text type="secondary">复刻前缀</Text>
              <Input
                style={{ width: 100 }}
                value={voicePrefix}
                onChange={(e) => setVoicePrefix(e.target.value || 'zhihui')}
              />
              <Text type="secondary">参考文稿</Text>
              <Input
                style={{ flex: 1, minWidth: 160 }}
                placeholder="Qwen 可选"
                value={referenceText}
                onChange={(e) => setReferenceText(e.target.value)}
                allowClear
              />
            </Space>
          )}

          <div>
            <Text strong style={{ display: 'block', marginBottom: 6 }}>
              试听文本
            </Text>
            <Input.TextArea rows={3} value={previewText} onChange={(e) => setPreviewText(e.target.value)} />
          </div>

          {lastVoiceId && !isMimoClone ?
            <Text type="secondary" style={{ fontSize: 12 }}>
              已复刻 voice_id：<Text code>{lastVoiceId}</Text>
            </Text>
          : null}

          <Flex gap={10} wrap="wrap" align="center">
            <Button type="primary" loading={busy} onClick={() => void onPreview()}>
              {isMimoClone ? '试听' : '复刻并试听'}
            </Button>
          </Flex>

          {busy ?
            <Spin tip={isMimoClone ? '正在合成试听…' : '正在复刻…'}>
              <div style={{ minHeight: 48 }} />
            </Spin>
          : previewUrl ?
            <>
              <audio controls src={previewUrl} style={{ width: '100%', maxHeight: 48 }} />
              <Flex gap={8} wrap="wrap">
                <Button type="primary" loading={usingVoice} onClick={() => void onUseVoice()}>
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
            将保存 wav 及同名 txt（文稿为参考文稿，供 LongCat 侧读取）。
          </Paragraph>
        </Form>
      </Modal>
    </>
  );
}
