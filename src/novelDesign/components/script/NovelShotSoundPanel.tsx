import { Button, Input, Select, Space, Typography } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import type { BGM, ShotSound, SoundEffect } from '@/constants/Script';

const { Text } = Typography;

const SFX_TIMING_OPTIONS = [
  { value: 'start', label: '开场' },
  { value: 'continuous', label: '持续' },
  { value: 'one_shot', label: '单次' },
] as const;

interface NovelShotSoundPanelProps {
  sound: ShotSound | undefined;
  onChange: (sound: ShotSound | undefined) => void;
}

function isSoundEmpty(s: ShotSound): boolean {
  const hasAmbiance = Boolean(s.ambiance?.trim());
  const hasBgm = Boolean(s.bgm?.trackName?.trim());
  const hasSfx = Array.isArray(s.sfx) && s.sfx.some((x) => x.name?.trim());
  return !hasAmbiance && !hasBgm && !hasSfx;
}

export function NovelShotSoundPanel({ sound, onChange }: NovelShotSoundPanelProps) {
  const s = sound ?? {};
  const sfxList = s.sfx ?? [];

  const commit = (next: ShotSound) => {
    onChange(isSoundEmpty(next) ? undefined : next);
  };

  const patch = (patchSound: Partial<ShotSound>) => {
    commit({ ...s, ...patchSound });
  };

  const patchBgm = (patchBgm: Partial<BGM>) => {
    const bgm: BGM = { trackName: s.bgm?.trackName ?? '', ...s.bgm, ...patchBgm };
    if (!bgm.trackName.trim()) {
      const { bgm: _removed, ...rest } = s;
      commit(rest);
      return;
    }
    commit({ ...s, bgm });
  };

  const updateSfx = (index: number, patchFx: Partial<SoundEffect>) => {
    const next = sfxList.map((fx, i) => (i === index ? { ...fx, ...patchFx } : fx));
    patch({ sfx: next.filter((x) => x.name?.trim()) });
  };

  const addSfx = () => {
    patch({ sfx: [...sfxList, { name: '', timing: 'one_shot' }] });
  };

  const removeSfx = (index: number) => {
    patch({ sfx: sfxList.filter((_, i) => i !== index) });
  };

  return (
    <Space orientation="vertical" style={{ width: '100%' }} size="small">
      <Text type="secondary" style={{ fontSize: 12 }}>
        声音设计
      </Text>
      <Space.Compact style={{ width: '100%' }}>
        <Input
          readOnly
          tabIndex={-1}
          value="环境"
          style={{
            width: 56,
            textAlign: 'center',
            cursor: 'default',
            color: 'var(--ant-color-text-secondary)',
            background: 'var(--ant-color-fill-tertiary)',
          }}
        />
        <Input
          style={{ width: 'calc(100% - 56px)' }}
          placeholder="环境音、氛围底噪…"
          value={s.ambiance ?? ''}
          onChange={(e) => patch({ ambiance: e.target.value || undefined })}
        />
      </Space.Compact>
      <Space.Compact style={{ width: '100%' }}>
        <Input
          readOnly
          tabIndex={-1}
          value="BGM"
          style={{
            width: 56,
            textAlign: 'center',
            cursor: 'default',
            color: 'var(--ant-color-text-secondary)',
            background: 'var(--ant-color-fill-tertiary)',
          }}
        />
        <Input
          style={{ width: 'calc(100% - 56px)' }}
          placeholder="背景音乐曲名或风格描述"
          value={s.bgm?.trackName ?? ''}
          onChange={(e) => patchBgm({ trackName: e.target.value })}
        />
      </Space.Compact>
      <Text type="secondary" style={{ fontSize: 11, marginLeft: 56 }}>
        音效
      </Text>
      {sfxList.map((fx, i) => (
        <Space key={`sfx_${i}`} wrap style={{ width: '100%', paddingLeft: 56 }}>
          <Input
            placeholder="音效名"
            value={fx.name}
            onChange={(e) => updateSfx(i, { name: e.target.value })}
            style={{ minWidth: 140, flex: 1 }}
          />
          <Select
            style={{ width: 96 }}
            value={fx.timing ?? 'one_shot'}
            onChange={(v) => updateSfx(i, { timing: v })}
            options={[...SFX_TIMING_OPTIONS]}
          />
          <Button type="text" danger icon={<DeleteOutlined />} onClick={() => removeSfx(i)} />
        </Space>
      ))}
      <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={addSfx} style={{ marginLeft: 56 }}>
        添加音效
      </Button>
    </Space>
  );
}
