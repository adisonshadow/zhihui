import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Radio,
  Select,
  Slider,
  Space,
  Tabs,
  Typography,
} from 'antd';
import type { AttachedAudioKind, SegmentAttachedAudio } from '@/constants/Audiobook';
import type { AISettings } from '@/types/settings';
import {
  ATTACHED_AUDIO_DEFAULT_DELAY_SEC,
  defaultAttachedAudioVolume,
} from '@/audiobook/utils/audiobookAttachedAudioDefaults';
import { saveAttachedSfxWav } from '@/audiobook/utils/audiobookAttachedSfxFiles';
import { postLocalSfxGenerate } from '@/novelDesign/utils/localSfxApi';
import {
  activeLocalSfxModelKey,
  buildLocalSfxSelectOptions,
  defaultDurationForLocalSfx,
  isLocalSfxReady,
} from '@/novelDesign/utils/localSfxModelOptions';
import { resolveAudiobookVoiceSampleRoots } from '@/audiobook/utils/audiobookVoiceSampleRoots';
import { resolveLocalAudioPlayUrl } from '@/novelDesign/utils/resolveLocalAudioPlayUrl';

const { Text } = Typography;

const AUDIO_FILE_FILTERS = [{ name: '音频', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac', 'webm'] }];

type SourceTab = 'localGen' | 'cloud' | 'localFile';

export interface AudiobookSegmentAttachedAudioModalProps {
  open: boolean;
  segmentIndex: number | null;
  editing: SegmentAttachedAudio | null;
  aiConfig: AISettings | null;
  onClose: () => void;
  onSave: (segmentIndex: number, item: SegmentAttachedAudio) => void;
  onDelete: (segmentIndex: number, itemId: string) => void;
}

interface FormValues {
  kind: AttachedAudioKind;
  delaySec: number;
  volume: number;
  description: string;
  audioSrc?: string;
}

function basenameFromPath(p: string): string {
  const parts = p.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] ?? p;
}

export function AudiobookSegmentAttachedAudioModal({
  open,
  segmentIndex,
  editing,
  aiConfig,
  onClose,
  onSave,
  onDelete,
}: AudiobookSegmentAttachedAudioModalProps) {
  const { message } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  const [pickingFile, setPickingFile] = useState(false);
  const [sourceTab, setSourceTab] = useState<SourceTab>('localGen');
  const [localModelKey, setLocalModelKey] = useState('moss_sound_effect');
  const [durationSec, setDurationSec] = useState(6);
  const [generating, setGenerating] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  const isEdit = Boolean(editing?.id);
  const kindWatch = Form.useWatch('kind', form) ?? 'soundEffect';
  const audioSrc = Form.useWatch('audioSrc', form);

  const sfxOptions = useMemo(() => buildLocalSfxSelectOptions(aiConfig), [aiConfig]);
  const customRoot = resolveAudiobookVoiceSampleRoots(aiConfig?.audiobook).custom;

  const revokePreview = useCallback(() => {
    const u = previewUrlRef.current;
    if (u?.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(u);
      } catch {
        /* ignore */
      }
    }
    previewUrlRef.current = null;
    setPreviewUrl(null);
  }, []);

  const initialValues = useMemo((): FormValues => {
    if (editing) {
      return {
        kind: editing.kind,
        delaySec: editing.delaySec,
        volume: editing.volume,
        description: editing.description,
        audioSrc: editing.audioSrc,
      };
    }
    return {
      kind: 'soundEffect',
      delaySec: ATTACHED_AUDIO_DEFAULT_DELAY_SEC,
      volume: defaultAttachedAudioVolume('soundEffect'),
      description: '',
      audioSrc: undefined,
    };
  }, [editing]);

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue(initialValues);
    setSourceTab(editing?.audioSrc ? 'localFile' : 'localGen');
    const mk = activeLocalSfxModelKey(aiConfig);
    setLocalModelKey(mk);
    setDurationSec(defaultDurationForLocalSfx(aiConfig, mk));
    revokePreview();
    if (editing?.audioSrc?.trim()) {
      setPreviewUrl(resolveLocalAudioPlayUrl(editing.audioSrc));
    }
  }, [open, form, initialValues, editing, aiConfig, revokePreview]);

  useEffect(() => {
    if (!open) revokePreview();
  }, [open, revokePreview]);

  const handleKindChange = useCallback(
    (kind: AttachedAudioKind) => {
      if (isEdit) return;
      form.setFieldValue('volume', defaultAttachedAudioVolume(kind));
    },
    [form, isEdit],
  );

  const pickLocalFile = useCallback(async () => {
    setPickingFile(true);
    try {
      const path = await window.yiman?.dialog?.openFile?.({ filters: AUDIO_FILE_FILTERS });
      if (!path?.trim()) return;
      form.setFieldValue('audioSrc', path.trim());
      revokePreview();
      setPreviewUrl(resolveLocalAudioPlayUrl(path.trim()));
      const desc = form.getFieldValue('description')?.trim();
      if (!desc) {
        form.setFieldValue('description', basenameFromPath(path.trim()));
      }
    } catch (e) {
      message.error(e instanceof Error ? e.message : '选择文件失败');
    } finally {
      setPickingFile(false);
    }
  }, [form, message, revokePreview]);

  const handleLocalGenerate = useCallback(async () => {
    const desc = form.getFieldValue('description')?.trim();
    if (!desc) {
      message.warning('请先填写描述');
      return;
    }
    if (!isLocalSfxReady(aiConfig, localModelKey)) {
      message.warning('请先在设置 → 本地生成音效 中启用并测试通过 MOSS SoundEffect');
      return;
    }
    setGenerating(true);
    try {
      const blob = await postLocalSfxGenerate({
        modelKey: localModelKey,
        description: desc,
        durationSeconds: durationSec,
      });
      const buf = await blob.arrayBuffer();
      const saved = await saveAttachedSfxWav({
        voiceSamplesRootDir: customRoot,
        description: desc,
        wavArrayBuffer: buf,
      });
      if (!saved.ok) {
        message.error(saved.error);
        return;
      }
      form.setFieldValue('audioSrc', saved.absolutePath);
      revokePreview();
      const url = URL.createObjectURL(blob);
      previewUrlRef.current = url;
      setPreviewUrl(url);
      message.success('音效已生成，可试听后保存');
    } catch (e) {
      message.error(e instanceof Error ? e.message : '生成失败');
    } finally {
      setGenerating(false);
    }
  }, [
    aiConfig,
    customRoot,
    durationSec,
    form,
    localModelKey,
    message,
    revokePreview,
  ]);

  const handleSave = useCallback(async () => {
    if (segmentIndex == null) return;
    try {
      const v = await form.validateFields();
      const description = v.description.trim() || (v.audioSrc ? basenameFromPath(v.audioSrc) : '');
      if (!description) {
        message.warning('请填写描述');
        return;
      }
      if (!v.audioSrc?.trim()) {
        message.warning('请先生成音效、选择云端（待接入）或选择本地文件');
        return;
      }
      const item: SegmentAttachedAudio = {
        id: editing?.id ?? crypto.randomUUID(),
        kind: v.kind,
        description,
        delaySec: Math.max(0, v.delaySec ?? ATTACHED_AUDIO_DEFAULT_DELAY_SEC),
        volume: Math.min(1, Math.max(0.1, v.volume ?? defaultAttachedAudioVolume(v.kind))),
        audioSrc: v.audioSrc.trim(),
      };
      onSave(segmentIndex, item);
      onClose();
    } catch {
      /* validation */
    }
  }, [editing?.id, form, message, onClose, onSave, segmentIndex]);

  const handleDelete = useCallback(() => {
    if (segmentIndex == null || !editing?.id) return;
    onDelete(segmentIndex, editing.id);
    onClose();
  }, [editing?.id, onClose, onDelete, segmentIndex]);

  const tabItems = [
    {
      key: 'localGen',
      label: '本地生成',
      children: (
        <Space orientation="vertical" style={{ width: '100%' }} size={12}>
          {kindWatch === 'backgroundMusic' ?
            <Alert
              type="info"
              showIcon
              message="MOSS SoundEffect 更适合短音效与环境声；背景音乐建议使用「本地文件」或后续云端能力。"
            />
          : null}
          {!sfxOptions.length ?
            <Alert
              type="warning"
              showIcon
              message="未启用本地音效"
              description="请打开 设置 → 本地生成音效，配置 MOSS-SoundEffect-MLX-4bit 并测试通过。"
            />
          : null}
          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              本地模型
            </Text>
            <Select
              style={{ width: '100%', marginTop: 4 }}
              value={localModelKey}
              options={sfxOptions}
              onChange={(v) => {
                setLocalModelKey(v);
                setDurationSec(defaultDurationForLocalSfx(aiConfig, v));
              }}
            />
          </div>
          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              生成时长（秒）
            </Text>
            <InputNumber
              min={2}
              max={15}
              step={0.5}
              value={durationSec}
              onChange={(n) => setDurationSec(typeof n === 'number' ? n : 6)}
              style={{ width: '100%', marginTop: 4 }}
            />
          </div>
          <Button
            type="primary"
            loading={generating}
            disabled={!sfxOptions.length}
            onClick={() => void handleLocalGenerate()}
          >
            生成音效
          </Button>
          {previewUrl ?
            <audio controls src={previewUrl} style={{ width: '100%' }} />
          : null}
        </Space>
      ),
    },
    {
      key: 'cloud',
      label: '云端AI生成',
      children: (
        <Alert
          type="info"
          showIcon
          message="云端 AI 音效生成待接入"
          description="当前版本请使用「本地生成」或「本地文件」。接入后将支持通过已配置的 AI 模型按描述生成音效。"
        />
      ),
    },
    {
      key: 'localFile',
      label: '本地文件',
      children: (
        <Space orientation="vertical" style={{ width: '100%' }}>
          <Button loading={pickingFile} onClick={() => void pickLocalFile()}>
            选择本地文件
          </Button>
          {audioSrc ?
            <Text type="secondary" style={{ fontSize: 12, wordBreak: 'break-all' }}>
              {basenameFromPath(audioSrc)}
            </Text>
          : null}
          {previewUrl && sourceTab === 'localFile' ?
            <audio controls src={previewUrl} style={{ width: '100%' }} />
          : null}
        </Space>
      ),
    },
  ];

  return (
    <Modal
      title={isEdit ? '编辑音乐/音效' : '添加音乐/音效'}
      open={open}
      onCancel={onClose}
      destroyOnHidden
      width={520}
      footer={
        <Space>
          {isEdit ?
            <Button danger onClick={handleDelete}>
              删除
            </Button>
          : null}
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" onClick={() => void handleSave()}>
            保存
          </Button>
        </Space>
      }
    >
      <Form form={form} layout="vertical" initialValues={initialValues}>
        <Form.Item name="kind" label="类型">
          <Radio.Group
            optionType="button"
            buttonStyle="solid"
            onChange={(e) => handleKindChange(e.target.value as AttachedAudioKind)}
            options={[
              { label: '音效', value: 'soundEffect' },
              { label: '背景音乐', value: 'backgroundMusic' },
            ]}
          />
        </Form.Item>

        <Form.Item
          label="延迟（秒）"
          tooltip="本段旁白/对白开始播放后，多少秒再播放此音效或音乐"
        >
          <Space.Compact style={{ width: '100%' }}>
            <Form.Item name="delaySec" noStyle rules={[{ required: true, message: '请填写延迟' }]}>
              <InputNumber min={0} step={0.1} style={{ width: '100%' }} />
            </Form.Item>
            <Button disabled tabIndex={-1}>
              秒
            </Button>
          </Space.Compact>
        </Form.Item>

        <Form.Item name="description" label="描述" rules={[{ required: true, message: '请填写描述' }]}>
          <Input placeholder="如：远处雷声滚动（持续）" maxLength={120} />
        </Form.Item>

        <Tabs activeKey={sourceTab} items={tabItems} onChange={(k) => setSourceTab(k as SourceTab)} />

        <Form.Item name="audioSrc" hidden>
          <Input />
        </Form.Item>

        <Form.Item name="volume" label="音量">
          <Slider min={0.1} max={1} step={0.05} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
